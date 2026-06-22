# GitHub に上げるときの流れ

## 何を上げるか

`video-podcast-tool` フォルダの中身を GitHub に上げます。

この設定では、次のような作業データは自動で除外されます。

- 生成した動画
- 一時アップロード素材
- 作業ログ
- 個人用の `config.json`

## GitHub でやること

1. GitHub で新しいリポジトリを作る
2. リポジトリ名は `video-podcast-tool` など分かりやすい名前にする
3. このフォルダの中身をそのリポジトリに入れる

## そのあと

GitHub に上がったら、次は Railway に接続して公開URLを作ります。

見るファイル:

- `README.md`
- `DEPLOY-RAILWAY.md`
- `Dockerfile`
