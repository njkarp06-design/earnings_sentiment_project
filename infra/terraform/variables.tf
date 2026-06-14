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
  default     = 730
}

variable "schedule_interval_hours" {
  description = "How often the ingestor re-scans all tickers (hours between runs)"
  type        = number
  default     = 2
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

variable "ingestor_url" {
  description = "Internal URL of the ingestor service — set when using Cloud Map or an internal ALB; empty disables on-demand ingest from BFF"
  type        = string
  default     = ""
}

variable "notification_provider" {
  description = "Notification provider for correlation-service alerts (none | resend)"
  type        = string
  default     = "none"
}

variable "app_url" {
  description = "Public URL of the frontend — embedded in notification emails"
  type        = string
  default     = ""
}

variable "notify_from_email" {
  description = "From address used in notification emails"
  type        = string
  default     = "onboarding@resend.dev"
}

variable "resend_api_key" {
  description = "Resend API key for email notifications — leave empty to disable"
  type        = string
  default     = ""
  sensitive   = true
}
