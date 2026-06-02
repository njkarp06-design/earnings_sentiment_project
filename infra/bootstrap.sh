#!/usr/bin/env bash
# Creates the S3 bucket and DynamoDB table needed for Terraform remote state.
# Run this ONCE before your first `terraform init`.
#
# Usage: bash infra/bootstrap.sh [region]
# Default region: us-east-1
set -euo pipefail

REGION="${1:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="esp-tfstate-${ACCOUNT_ID}"
TABLE="esp-tfstate-lock"

echo "==> Creating Terraform state bucket: s3://${BUCKET}"
if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
else
    aws s3api create-bucket \
        --bucket "$BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
fi

aws s3api put-bucket-versioning \
    --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
    --bucket "$BUCKET" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

echo "==> Creating DynamoDB lock table: ${TABLE}"
aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    --no-cli-pager

echo ""
echo "Done. Next steps:"
echo "  1. Edit infra/terraform/providers.tf — uncomment the backend block and set:"
echo "       bucket = \"${BUCKET}\""
echo "       region = \"${REGION}\""
echo "  2. Run: terraform -chdir=infra/terraform init"
echo "  3. Also add ${BUCKET} and ${TABLE} to your GitHub Actions secrets if using S3 backend in CI"
