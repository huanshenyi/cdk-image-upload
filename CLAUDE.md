# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## よく使用されるコマンド

### ビルドとテスト
- `npm run build` - TypeScriptのコンパイル
- `npm run watch` - ファイル変更の監視とコンパイル
- `npm run test` - Jestユニットテストの実行

### CDKコマンド
- `npx cdk deploy` - AWSにスタックをデプロイ
- `npx cdk diff` - 現在の状態とデプロイ済みスタックを比較
- `npx cdk synth` - CloudFormationテンプレートを生成

### Lambda関数のビルド（必要に応じて）
```bash
cd lambda/upload-ts && npm run build
cd lambda/resize-ts && npm run build
```

## アーキテクチャ概要

このプロジェクトは画像アップロード・リサイズシステムで、以下の主要コンポーネントで構成されています：

### コアアーキテクチャ
1. **S3バケット**（2つ）:
   - オリジナル画像用（`originalBucket`）
   - リサイズ済み画像用（`resizedBucket`）
   - 90日後の自動削除でコスト最適化

2. **Lambda関数**（2つ）:
   - **アップロード関数** (`lambda/upload-ts/index.ts`): API Gatewayからの画像をBase64デコードしてS3に保存
   - **リサイズ関数** (`lambda/resize-ts/index.ts`): Sharp.jsでサムネイル、中、大の3サイズに自動リサイズ

3. **API Gateway**:
   - `/upload` POST: APIキー認証付き画像アップロード
   - `/images/{id}` GET: S3への直接統合でLambdaを回避してコスト削減

### 重要な設計パターン
- **S3イベントトリガー**: 画像アップロード時に自動でリサイズ関数を実行
- **API Gateway → S3直接統合**: 画像取得時はLambdaを経由せずS3から直接配信
- **APIキー認証**: アップロードエンドポイントのアクセス制御
- **CORS対応**: ブラウザからの直接アクセスをサポート

## 主要ファイル構造

### CDKインフラ
- `lib/image-upload-stack.ts` - メインのCDKスタック定義（実際に使用される）
- `lib/cdk-image-upload-stack.ts` - 未使用の初期スケルトン
- `bin/cdk-image-upload.ts` - CDKアプリのエントリーポイント

### Lambda関数
- `lambda/upload-ts/index.ts` - 画像アップロード処理（Base64デコードのバグ修正済み）
- `lambda/resize-ts/index.ts` - Sharp.jsを使用した画像リサイズ処理

### 重要な実装詳細
- アップロード関数で`event.isBase64Encoded`チェックによるAPI Gateway経由のBase64エンコード問題を解決
- リサイズ関数は`sharp`ライブラリでDockerバンドリングを使用
- S3のライフサイクルルールで90日後削除によるコスト最適化

## デプロイ後の設定

デプロイ後、以下でAPIキーを取得：
```bash
aws apigateway get-api-key --api-key [API_KEY_ID] --include-value
```

## 開発のヒント

- Lambda関数の変更時は`npm run build`でCDKスタックもリビルドが必要
- 画像リサイズはSharp.jsのDockerバンドリングによりLinux環境でのみ動作
- APIキーは使用量プランで1秒10リクエスト、バースト20に制限
- CORS設定により`*`からのアクセスを許可