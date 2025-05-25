# Image Upload CDK Project

このプロジェクトは、AWS CDK を使用して画像アップロードとリサイズ機能を実装するインフラストラクチャを構築します。

## アーキテクチャ

このプロジェクトは以下のコンポーネントで構成されています：

1. **S3 バケット**：

   - オリジナル画像用バケット
   - リサイズ済み画像用バケット

2. **Lambda 関数**：

   - アップロード関数：API からの画像を S3 に保存
   - リサイズ関数：S3 にアップロードされた画像を複数のサイズにリサイズ

3. **API Gateway**：
   - `/upload` エンドポイント：画像をアップロードするための POST エンドポイント（API キー認証付き）
   - `/images/{id}` エンドポイント：リサイズされた画像を取得するための GET エンドポイント

## デプロイ方法

### 前提条件

- Node.js (v14 以上)
- AWS CLI（設定済み）
- AWS CDK（インストール済み）

### 依存関係のインストール

```bash
# プロジェクトルートディレクトリで実行
npm install

# Lambda関数の依存関係をインストール
cd lambda/upload-ts
npm install
cd ../resize-ts
npm install
cd ../..
```

### ビルド

```bash
# Lambda関数のTypeScriptをビルド
cd lambda/upload-ts
npm run build
cd ../resize-ts
npm run build
cd ../..

# CDKアプリをビルド
npm run build
```

### API キーの取得

デプロイ後、以下のコマンドで API キーを取得します：

```bash
# デプロイ出力に表示されるAPI_KEY_IDを使用
aws apigateway get-api-key --api-key API_KEY_ID --include-value
```

## 使用方法

デプロイ後、以下のエンドポイントが利用可能になります：

1. **画像のアップロード**：

   ```
   POST https://{api-id}.execute-api.{region}.amazonaws.com/prod/upload
   ```

   リクエストヘッダー：

   ```
   Content-Type: application/json
   x-api-key: YOUR_API_KEY_HERE  # デプロイ後に取得したAPIキー
   ```

   リクエストボディ：

   ```json
   {
     "image": "Base64エンコードされた画像データ",
     "contentType": "image/jpeg"
   }
   ```

2. **画像の取得**：

   ```
   GET https://{api-id}.execute-api.{region}.amazonaws.com/prod/images/{image-id}
   ```

   リサイズされたバージョンを取得するには：

   ```
   GET https://{api-id}.execute-api.{region}.amazonaws.com/prod/images/{image-id-without-extension}-{size}.{extension}
   ```

   サイズは `thumbnail`, `medium`, `large` のいずれかです。

## クライアント実装例

### HTML/JavaScript での実装例

以下は、ブラウザから画像をアップロードして表示するシンプルな HTML と JavaScript の例です：

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>画像アップロードデモ</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }
      .image-container {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 20px;
      }
      .image-item {
        border: 1px solid #ddd;
        padding: 10px;
        text-align: center;
      }
      .image-item img {
        max-width: 100%;
      }
      .loading {
        display: none;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <h1>画像アップロードデモ</h1>

    <div>
      <input type="file" id="imageInput" accept="image/*" />
      <button id="uploadButton">アップロード</button>
      <div class="loading" id="loadingIndicator">アップロード中...</div>
    </div>

    <div class="image-container" id="imageContainer"></div>

    <script>
      // APIエンドポイントとAPIキーを設定（デプロイ後に取得した値に置き換えてください）
      const API_ENDPOINT =
        "https://{api-id}.execute-api.{region}.amazonaws.com/prod";
      const API_KEY = "YOUR_API_KEY_HERE";

      document
        .getElementById("uploadButton")
        .addEventListener("click", async () => {
          const fileInput = document.getElementById("imageInput");
          const file = fileInput.files[0];

          if (!file) {
            alert("ファイルを選択してください");
            return;
          }

          // ローディング表示
          document.getElementById("loadingIndicator").style.display = "block";

          try {
            // ファイルをBase64エンコード
            const base64Image = await readFileAsBase64(file);

            // APIにアップロード
            const response = await fetch(`${API_ENDPOINT}/upload`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY, // APIキーをヘッダーに追加
              },
              body: JSON.stringify({
                image: base64Image,
                contentType: file.type,
              }),
            });

            const result = await response.json();

            if (response.ok) {
              // アップロード成功
              displayImages(result.imageId);
            } else {
              // エラー処理
              alert(
                `エラー: ${result.error || "画像のアップロードに失敗しました"}`
              );
            }
          } catch (error) {
            console.error("アップロードエラー:", error);
            alert("画像のアップロードに失敗しました");
          } finally {
            // ローディング非表示
            document.getElementById("loadingIndicator").style.display = "none";
          }
        });

      // ファイルをBase64にエンコードする関数
      function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // 画像を表示する関数
      function displayImages(imageId) {
        const container = document.getElementById("imageContainer");
        const baseFileName = imageId.split(".")[0];
        const extension = imageId.split(".")[1];

        // サイズのバリエーション
        const sizes = [
          { name: "オリジナル", suffix: "" },
          { name: "サムネイル", suffix: "-thumbnail" },
          { name: "中サイズ", suffix: "-medium" },
          { name: "大サイズ", suffix: "-large" },
        ];

        // 各サイズの画像を表示
        sizes.forEach((size) => {
          const imgFileName = size.suffix
            ? `${baseFileName}${size.suffix}.${extension}`
            : imageId;

          const imgUrl = `${API_ENDPOINT}/images/${imgFileName}`;

          const imageDiv = document.createElement("div");
          imageDiv.className = "image-item";

          const img = document.createElement("img");
          img.src = imgUrl;
          img.alt = `${size.name}画像`;

          const caption = document.createElement("p");
          caption.textContent = size.name;

          imageDiv.appendChild(img);
          imageDiv.appendChild(caption);
          container.appendChild(imageDiv);
        });
      }
    </script>
  </body>
</html>
```

### Node.js での実装例

サーバーサイドで Node.js を使用して画像をアップロードする例：

```javascript
const fs = require("fs");
const axios = require("axios");

// APIエンドポイントとAPIキーを設定（デプロイ後に取得した値に置き換えてください）
const API_ENDPOINT = "https://{api-id}.execute-api.{region}.amazonaws.com/prod";
const API_KEY = "YOUR_API_KEY_HERE";

// 画像ファイルをアップロードする関数
async function uploadImage(filePath) {
  try {
    // ファイルを読み込み
    const fileData = fs.readFileSync(filePath);
    const base64Image = fileData.toString("base64");

    // ファイルタイプを判定（簡易版）
    let contentType = "image/jpeg";
    if (filePath.endsWith(".png")) {
      contentType = "image/png";
    } else if (filePath.endsWith(".gif")) {
      contentType = "image/gif";
    }

    // APIにアップロード
    const response = await axios.post(
      `${API_ENDPOINT}/upload`,
      {
        image: `data:${contentType};base64,${base64Image}`,
        contentType: contentType,
      },
      {
        headers: {
          "x-api-key": API_KEY, // APIキーをヘッダーに追加
        },
      }
    );

    console.log("アップロード成功:", response.data);
    return response.data;
  } catch (error) {
    console.error("アップロードエラー:", error.response?.data || error.message);
    throw error;
  }
}

// 使用例
uploadImage("./sample.jpg")
  .then((result) => {
    console.log(`画像ID: ${result.imageId}`);
    console.log(`オリジナル画像URL: ${API_ENDPOINT}${result.url}`);

    // リサイズされた画像のURLを生成
    const baseFileName = result.imageId.split(".")[0];
    const extension = result.imageId.split(".")[1];

    console.log(
      `サムネイルURL: ${API_ENDPOINT}/images/${baseFileName}-thumbnail.${extension}`
    );
    console.log(
      `中サイズURL: ${API_ENDPOINT}/images/${baseFileName}-medium.${extension}`
    );
    console.log(
      `大サイズURL: ${API_ENDPOINT}/images/${baseFileName}-large.${extension}`
    );
  })
  .catch((err) => {
    console.error("処理に失敗しました:", err);
  });
```

### cURL での使用例

コマンドラインから cURL を使用して画像をアップロードする例：

```bash
# 画像をBase64エンコード
BASE64_IMAGE=$(base64 -i ./sample.jpg)

# APIにPOSTリクエスト
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY_HERE" \
  -d "{\"image\":\"data:image/jpeg;base64,${BASE64_IMAGE}\",\"contentType\":\"image/jpeg\"}" \
  https://{api-id}.execute-api.{region}.amazonaws.com/prod/upload
```

## コスト最適化

このプロジェクトは以下のコスト最適化策を実装しています：

- S3 バケットのライフサイクルルール（30 日後に削除）
- API Gateway から S3 への直接統合（Lambda を経由しない）
- API Gateway のログ無効化（コスト削減）

## 注意事項

- このプロジェクトはデモ用であり、本番環境では追加のセキュリティ対策が必要です
- 画像のサイズ制限や CORS の設定など、必要に応じて調整してください

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

## React.js での実装例

React アプリケーションでの画像アップロードコンポーネントの例：

```jsx
import React, { useState } from "react";
import "./ImageUploader.css";

const API_ENDPOINT = "https://{api-id}.execute-api.{region}.amazonaws.com/prod";
const API_KEY = "YOUR_API_KEY_HERE"; // デプロイ後に取得したAPIキー

function ImageUploader() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [error, setError] = useState("");

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("ファイルを選択してください");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // ファイルをBase64エンコード
      const base64 = await convertToBase64(selectedFile);

      // APIにアップロード
      const response = await fetch(`${API_ENDPOINT}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY, // APIキーをヘッダーに追加
        },
        body: JSON.stringify({
          image: base64,
          contentType: selectedFile.type,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "アップロードに失敗しました");
      }

      // 画像情報を保存
      const imageId = data.imageId;
      const baseFileName = imageId.split(".")[0];
      const extension = imageId.split(".")[1];

      const newImages = [
        {
          id: imageId,
          original: `${API_ENDPOINT}/images/${imageId}`,
          thumbnail: `${API_ENDPOINT}/images/${baseFileName}-thumbnail.${extension}`,
          medium: `${API_ENDPOINT}/images/${baseFileName}-medium.${extension}`,
          large: `${API_ENDPOINT}/images/${baseFileName}-large.${extension}`,
        },
      ];

      setUploadedImages([...newImages, ...uploadedImages]);
      setSelectedFile(null);

      // ファイル入力をリセット
      document.getElementById("file-input").value = "";
    } catch (err) {
      console.error("アップロードエラー:", err);
      setError(err.message || "アップロードに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <div className="image-uploader">
      <h2>画像アップローダー</h2>

      <div className="upload-container">
        <input
          id="file-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={isLoading}
        />
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isLoading}
          className="upload-button"
        >
          {isLoading ? "アップロード中..." : "アップロード"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {uploadedImages.length > 0 && (
        <div className="gallery">
          <h3>アップロードした画像</h3>
          <div className="image-grid">
            {uploadedImages.map((image, index) => (
              <div key={index} className="image-card">
                <img
                  src={image.thumbnail}
                  alt={`アップロード画像 ${index + 1}`}
                />
                <div className="image-links">
                  <a
                    href={image.original}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    オリジナル
                  </a>
                  <a
                    href={image.medium}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    中サイズ
                  </a>
                  <a
                    href={image.large}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    大サイズ
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageUploader;
```

export default ImageUploader;

````

対応するCSSファイル（ImageUploader.css）：

```css
.image-uploader {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.upload-container {
  display: flex;
  margin-bottom: 20px;
  gap: 10px;
  align-items: center;
}

.upload-button {
  padding: 8px 16px;
  background-color: #4285f4;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.upload-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error-message {
  color: #d32f2f;
  margin-bottom: 15px;
}

.gallery {
  margin-top: 30px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.image-card {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.image-card img {
  width: 100%;
  height: 150px;
  object-fit: cover;
}

.image-links {
  display: flex;
  justify-content: space-around;
  padding: 8px;
  background-color: #f5f5f5;
}

.image-links a {
  color: #4285f4;
  text-decoration: none;
  font-size: 12px;
}

.image-links a:hover {
  text-decoration: underline;
}
````

### デプロイ

```bash
# CDKアプリをデプロイ
npx cdk deploy
```

# ### トラブルシューティング

ERROR: failed to solve: public.ecr.aws/sam/build-nodejs18.x: failed to resolve source metadata for public.ecr.aws/sam/build-nodejs18.x:latest: unexpected status from HEAD request to https://public.ecr.aws/v2/sam/build-nodejs18.x/manifests/latest: 403 Forbidden

```bash
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
docker pull public.ecr.aws/sam/build-nodejs20.x --platform="linux/amd64"
```
