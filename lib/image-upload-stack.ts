import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export class ImageUploadStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3バケットの作成（オリジナル画像用）
    const originalBucket = new s3.Bucket(this, "OriginalImageBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // 30日後に削除（コスト削減）
        },
      ],
    });

    // リサイズ済み画像用のS3バケット
    const resizedBucket = new s3.Bucket(this, "ResizedImageBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30), // 30日後に削除（コスト削減）
        },
      ],
    });

    // 画像アップロード用Lambda関数
    const uploadFunction = new NodejsFunction(this, "UploadFunction", {
      description: "画像アップロード用のLambda関数",
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "./lambda/upload-ts/index.ts",
      handler: "handler",
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_NAME: originalBucket.bucketName,
        RESIZED_BUCKET_NAME: resizedBucket.bucketName,
      },
    });

    // リサイズ処理用Lambda関数
    const resizeFunction = new NodejsFunction(this, "ResizeFunction", {
      description: "リサイズ用のLambda関数",
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "./lambda/resize-ts/index.ts",
      handler: "handler",
      memorySize: 1024,
      bundling: {
        nodeModules: ["sharp"],
        forceDockerBundling: true,
      },
      timeout: cdk.Duration.seconds(30),
      environment: {
        RESIZED_BUCKET_NAME: resizedBucket.bucketName,
      },
    });

    // S3バケットへのアクセス権限を付与
    originalBucket.grantReadWrite(uploadFunction);
    originalBucket.grantRead(resizeFunction);
    resizedBucket.grantWrite(resizeFunction);

    // S3トリガーの設定（画像がアップロードされたらリサイズ関数を実行）
    originalBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(resizeFunction)
    );

    // Lambda関数にS3イベントを処理する権限を付与
    resizeFunction.addPermission("AllowS3Invocation", {
      principal: new iam.ServicePrincipal("s3.amazonaws.com"),
      sourceArn: originalBucket.bucketArn,
    });

    // API Gatewayの設定
    const api = new apigateway.RestApi(this, "ImageUploadApi", {
      deployOptions: {
        stageName: "prod",
        loggingLevel: apigateway.MethodLoggingLevel.OFF,
      },
      // APIキーの設定を有効化
      apiKeySourceType: apigateway.ApiKeySourceType.HEADER,
      // バイナリメディアタイプを設定（画像を正しく処理するため）
      binaryMediaTypes: ['*/*'],
    });

    // APIキーを作成
    const apiKey = api.addApiKey("ImageUploadApiKey");

    // 使用量プランを作成
    const plan = api.addUsagePlan("ImageUploadUsagePlan", {
      name: "ImageUploadPlan",
      throttle: {
        rateLimit: 10, // 1秒あたりのリクエスト数
        burstLimit: 20, // バーストリクエスト数
      },
    });

    // 使用量プランにAPIキーを関連付け
    plan.addApiKey(apiKey);

    // 使用量プランにAPIステージを関連付け
    plan.addApiStage({
      stage: api.deploymentStage,
    });

    // APIエンドポイントの追加
    const uploadResource = api.root.addResource("upload");
    uploadResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(uploadFunction),
      {
        apiKeyRequired: true, // APIキーを必須に設定
      }
    );

    // リサイズ済み画像を取得するためのエンドポイント
    const imagesResource = api.root.addResource("images");
    const imageResource = imagesResource.addResource("{id}");

    // S3へのダイレクトアクセスを設定（Lambda不要でコスト削減）
    const getImageIntegration = new apigateway.AwsIntegration({
      service: "s3",
      integrationHttpMethod: "GET",
      path: `${resizedBucket.bucketName}/{file}`,
      options: {
        credentialsRole: new iam.Role(this, "ApiGatewayS3Role", {
          assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName(
              "AmazonS3ReadOnlyAccess"
            ),
          ],
        }),
        requestParameters: {
          "integration.request.path.file": "method.request.path.id",
        },
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type":
                "integration.response.header.Content-Type",
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
            contentHandling: apigateway.ContentHandling.CONVERT_TO_BINARY,
          },
          {
            statusCode: "404",
            selectionPattern: "404",
          },
        ],
      },
    });

    imageResource.addMethod("GET", getImageIntegration, {
      requestParameters: {
        "method.request.path.id": true,
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Content-Type": true,
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
        {
          statusCode: "404",
        },
      ],
    });

    // 出力値
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.url,
    });
    new cdk.CfnOutput(this, "OriginalBucketName", {
      value: originalBucket.bucketName,
    });
    new cdk.CfnOutput(this, "ResizedBucketName", {
      value: resizedBucket.bucketName,
    });
    new cdk.CfnOutput(this, "ApiKeyId", {
      value: apiKey.keyId,
      description:
        "API Keyの取得に使用するID（AWS CLIで取得: aws apigateway get-api-key --api-key [API_KEY_ID] --include-value）",
    });
  }
}
