#!/usr/bin/env sh

# エラー時は停止
set -e

# ビルド
npm run build

# distディレクトリに移動
cd dist

# GitHubPages用に.nojekyllファイルを作成
echo > .nojekyll

# Gitリポジトリとして初期化しコミット
git init
git add -A
git commit -m 'deploy'

# GitHub Pagesにデプロイ
git push -f git@github.com:code4history/oral-history-tool.git main:gh-pages

cd -