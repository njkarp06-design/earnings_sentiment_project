# One log group per service (14-day retention to control cost)
resource "aws_cloudwatch_log_group" "services" {
  for_each          = local.log_groups
  name              = "/esp/${each.key}"
  retention_in_days = 14
  tags              = { Name = "esp-${each.key}-logs" }
}

# Overview dashboard — one log widget per service
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "log"
        x      = 0
        y      = 0
        width  = 24
        height = 6
        properties = {
          title  = "Ingestor"
          region = var.aws_region
          query  = "SOURCE '/esp/ingestor' | fields @timestamp, @message | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Scoring Service"
          region = var.aws_region
          query  = "SOURCE '/esp/scoring-service' | fields @timestamp, @message | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Correlation Service"
          region = var.aws_region
          query  = "SOURCE '/esp/correlation-service' | fields @timestamp, @message | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "BFF"
          region = var.aws_region
          query  = "SOURCE '/esp/bff' | fields @timestamp, @message | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Frontend"
          region = var.aws_region
          query  = "SOURCE '/esp/frontend' | fields @timestamp, @message | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
    ]
  })
}

# Alert if the scoring service drops to zero running tasks for 2 minutes
resource "aws_cloudwatch_metric_alarm" "scoring_service_down" {
  alarm_name          = "${var.project_name}-scoring-service-down"
  alarm_description   = "Scoring service has no running ECS tasks"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1

  dimensions = {
    ClusterName = "${var.project_name}-cluster"
    ServiceName = "${var.project_name}-scoring-service"
  }
}
