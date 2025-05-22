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
    // リクエストボディからBase64エンコードされた画像を取得
    const body = JSON.parse(event.body || '{}') as UploadRequestBody;
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

    // Base64デコード
    const buffer = Buffer.from(body.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    
    // ファイル名の生成（UUID）
    const fileId = uuidv4();
    const fileExtension = body.contentType.split('/')[1];
    const fileName = `${fileId}.${fileExtension}`;
    
    // S3にアップロード
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
