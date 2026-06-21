# ── Shared assume-role policy for ECS tasks ───────────────────────────────────

data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── Task Execution Role — used by ECS to pull images + inject secrets ─────────

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project_name}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_basic" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow the execution role to read the Secrets Manager secrets
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "read-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.mongo_uri.arn,
          aws_secretsmanager_secret.anthropic_api_key.arn,
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.fmp_api_key.arn,
          aws_secretsmanager_secret.resend_api_key.arn,
        ]
      }
    ]
  })
}

# ── Task Role — runtime permissions for running containers ────────────────────

resource "aws_iam_role" "ecs_task" {
  name               = "${var.project_name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

# Ingestor needs to write to the transcript archive bucket
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-transcript-archive"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.transcripts.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecs_task_cloudwatch" {
  name = "cloudwatch-metrics"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
      }
    ]
  })
}
