import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const s3 = new S3();

interface UploadRequestBody {
  image: string;
  contentType: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // OPTIONSリクエストの処理
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        body: ''
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Request body is required' })
      };
    }

    // 🔥 ここが重要な修正部分：Base64デコードしてからJSONパース
    let bodyString = event.body;
    if (event.isBase64Encoded) {
      bodyString = Buffer.from(event.body, 'base64').toString('utf-8');
    }

    const body = JSON.parse(bodyString) as UploadRequestBody;
    
    if (!body.image || !body.contentType) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Image and contentType are required' })
      };
    }

    // 残りの処理は変更なし
    const buffer = Buffer.from(body.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    
    const fileId = uuidv4();
    const fileExtension = body.contentType.split('/')[1];
    const fileName = `${fileId}.${fileExtension}`;
    
    await s3.putObject({
      Bucket: process.env.BUCKET_NAME || '',
      Key: fileName,
      Body: buffer,
      ContentType: body.contentType
    }).promise();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Image uploaded successfully',
        imageId: fileName,
        url: `/images/${fileName}`
      })
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to upload image' })
    };
  }
};