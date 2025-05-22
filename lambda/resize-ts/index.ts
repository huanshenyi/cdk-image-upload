import { S3Event, S3EventRecord } from 'aws-lambda';
import { S3 } from 'aws-sdk';
const sharp = require("sharp")

const s3 = new S3();

interface Size {
  width: number;
  height: number;
  suffix: string;
}

export const handler = async (event: S3Event): Promise<any> => {
  try {
    // S3イベントからバケット名とキー（ファイル名）を取得
    const record: S3EventRecord = event.Records[0];
    const bucket: string = record.s3.bucket.name;
    const key: string = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    // オリジナル画像をS3から取得
    const originalImage = await s3.getObject({
      Bucket: bucket,
      Key: key
    }).promise();
    
    // 画像のリサイズ処理（3つのサイズを作成）
    const sizes: Size[] = [
      { width: 100, height: 100, suffix: 'thumbnail' },
      { width: 500, height: 500, suffix: 'medium' },
      { width: 1024, height: 1024, suffix: 'large' }
    ];
    
    // 各サイズごとに処理して保存
    const resizePromises = sizes.map(async (size: Size) => {
      const { width, height, suffix } = size;
      
      // ファイル名の作成（例: original-thumbnail.jpg）
      const fileNameParts: string[] = key.split('.');
      const extension: string = fileNameParts.pop() || '';
      const baseName: string = fileNameParts.join('.');
      const newKey: string = `${baseName}-${suffix}.${extension}`;
      
      // 画像のリサイズ
      const resizedBuffer = await sharp(originalImage.Body as Buffer)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      
      // リサイズした画像をS3に保存
      return s3.putObject({
        Bucket: process.env.RESIZED_BUCKET_NAME || '',
        Key: newKey,
        Body: resizedBuffer,
        ContentType: originalImage.ContentType
      }).promise();
    });
    
    // オリジナルサイズもリサイズバケットにコピー
    const copyOriginalPromise = s3.copyObject({
      Bucket: process.env.RESIZED_BUCKET_NAME || '',
      Key: key,
      CopySource: `${bucket}/${key}`,
      MetadataDirective: 'COPY'
    }).promise();
    
    // すべての処理を並行実行
    await Promise.all([...resizePromises, copyOriginalPromise]);
    
    console.log(`Successfully resized ${key}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Image resized successfully' })
    };
  } catch (error) {
    console.error('Error resizing image:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to resize image' })
    };
  }
};
