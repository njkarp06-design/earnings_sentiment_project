locals {
  account_id   = data.aws_caller_identity.current.account_id
  ecr_registry = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  # HTTPS is enabled on the ALBs only when an ACM certificate ARN is supplied.
  tls_enabled = var.acm_certificate_arn != ""

  # Application service names — used for ECR repos + CloudWatch log groups
  app_services = toset([
    "ingestor",
    "scoring-service",
    "correlation-service",
    "bff",
    "frontend",
  ])

  # Log group names: all app services + kafka-setup one-shot + msk broker logs
  log_groups = toset(concat(
    tolist(local.app_services),
    ["kafka-setup", "msk"]
  ))
}
