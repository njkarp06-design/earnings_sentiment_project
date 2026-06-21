variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment label (used in resource names + tags)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Short project identifier used as a prefix for all resource names"
  type        = string
  default     = "esp"
}

variable "availability_zones" {
  description = "Two AZs to spread the VPC subnets and MSK brokers across"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ── Secrets (set via terraform.tfvars or CI/CD TF_VAR_* env vars) ─────────────

variable "mongo_uri" {
  description = "MongoDB Atlas connection string (mongodb+srv://...)"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key used by the scoring service"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret for the BFF (generate: openssl rand -hex 32)"
  type        = string
  sensitive   = true
}

variable "fmp_api_key" {
  description = "Financial Modeling Prep API key — leave empty to disable FMP fallback"
  type        = string
  default     = ""
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key for email notifications — leave empty to disable"
  type        = string
  default     = ""
  sensitive   = true
}

# ── Application config ────────────────────────────────────────────────────────

variable "edgar_user_agent" {
  description = "User-agent string sent to SEC EDGAR (required by their fair-use policy)"
  type        = string
  default     = "EarningsSentimentResearch contact@example.com"
}

variable "tickers" {
  description = "Comma-separated list of tickers for the ingestor to monitor"
  type        = string
  default     = "AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA,JPM,JNJ,XOM"
}

variable "lookback_days" {
  description = "Days to look back for filings on the ingestor's first run"
  type        = number
  default     = 30
}

variable "schedule_hour" {
  description = "UTC hour (0–23) for the nightly ingest cron"
  type        = number
  default     = 6
}

variable "scoring_model" {
  description = "Claude model ID used by the scoring service"
  type        = string
  default     = "claude-sonnet-4-6"
}

variable "price_fetch_days" {
  description = "Calendar days of price data fetched after each earnings call"
  type        = number
  default     = 12
}

variable "notification_provider" {
  description = "Email notification provider for the correlation service (\"resend\" or \"none\")"
  type        = string
  default     = "none"
}

variable "notify_from_email" {
  description = "From-address for notification emails (must be a Resend-verified sender)"
  type        = string
  default     = "onboarding@resend.dev"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS on the ALBs. Leave empty to serve HTTP only; when set, an HTTPS:443 listener is added and HTTP:80 redirects to it."
  type        = string
  default     = ""
}
