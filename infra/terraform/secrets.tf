# recovery_window_in_days = 0 allows immediate deletion — fine for dev/learning.
# Set to 7 or 30 in a production environment.

resource "aws_secretsmanager_secret" "mongo_uri" {
  name                    = "${var.project_name}/mongo-uri"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "mongo_uri" {
  secret_id     = aws_secretsmanager_secret.mongo_uri.id
  secret_string = var.mongo_uri
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "${var.project_name}/anthropic-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = var.anthropic_api_key
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}/jwt-secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "fmp_api_key" {
  name                    = "${var.project_name}/fmp-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "fmp_api_key" {
  secret_id     = aws_secretsmanager_secret.fmp_api_key.id
  secret_string = var.fmp_api_key != "" ? var.fmp_api_key : "disabled"
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name                    = "${var.project_name}/resend-api-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "resend_api_key" {
  secret_id     = aws_secretsmanager_secret.resend_api_key.id
  secret_string = var.resend_api_key != "" ? var.resend_api_key : "disabled"
}
