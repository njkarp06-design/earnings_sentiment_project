# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${var.project_name}-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ── One-shot: create Kafka topics on MSK ──────────────────────────────────────
# Triggered by the CI/CD pipeline via `aws ecs run-task` after MSK is ready.

resource "aws_ecs_task_definition" "kafka_setup" {
  family                   = "${var.project_name}-kafka-setup"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "kafka-setup"
      image     = "confluentinc/cp-kafka:7.5.0"
      essential = true
      command = [
        "/bin/bash", "-c",
        join(" && ", [
          "kafka-topics --bootstrap-server $KAFKA_BOOTSTRAP_SERVERS --create --if-not-exists --topic raw-transcripts --replication-factor 2 --partitions 3",
          "kafka-topics --bootstrap-server $KAFKA_BOOTSTRAP_SERVERS --create --if-not-exists --topic raw-prices --replication-factor 2 --partitions 3",
          "kafka-topics --bootstrap-server $KAFKA_BOOTSTRAP_SERVERS --create --if-not-exists --topic scored-transcripts --replication-factor 2 --partitions 3",
          "echo 'Topics ready:' && kafka-topics --bootstrap-server $KAFKA_BOOTSTRAP_SERVERS --list",
        ])
      ]
      environment = [
        { name = "KAFKA_BOOTSTRAP_SERVERS", value = aws_msk_cluster.main.bootstrap_brokers },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["kafka-setup"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

# ── Ingestor ──────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "ingestor" {
  family                   = "${var.project_name}-ingestor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "ingestor"
      image     = "${aws_ecr_repository.services["ingestor"].repository_url}:latest"
      essential = true
      environment = [
        { name = "KAFKA_BOOTSTRAP_SERVERS", value = aws_msk_cluster.main.bootstrap_brokers },
        { name = "EDGAR_USER_AGENT",        value = var.edgar_user_agent },
        { name = "TICKERS",                 value = var.tickers },
        { name = "LOOKBACK_DAYS",           value = tostring(var.lookback_days) },
        { name = "SCHEDULE_HOUR",           value = tostring(var.schedule_hour) },
        { name = "S3_TRANSCRIPT_BUCKET",    value = aws_s3_bucket.transcripts.bucket },
      ]
      secrets = [
        { name = "MONGO_URI",   valueFrom = aws_secretsmanager_secret.mongo_uri.arn },
        { name = "FMP_API_KEY", valueFrom = aws_secretsmanager_secret.fmp_api_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["ingestor"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "ingestor" {
  name            = "${var.project_name}-ingestor"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ingestor.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ── Scoring Service ───────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "scoring_service" {
  family                   = "${var.project_name}-scoring-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "scoring-service"
      image     = "${aws_ecr_repository.services["scoring-service"].repository_url}:latest"
      essential = true
      environment = [
        { name = "KAFKA_BOOTSTRAP_SERVERS", value = aws_msk_cluster.main.bootstrap_brokers },
        { name = "SCORING_MODEL",           value = var.scoring_model },
      ]
      secrets = [
        { name = "MONGO_URI",         valueFrom = aws_secretsmanager_secret.mongo_uri.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["scoring-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "scoring_service" {
  name            = "${var.project_name}-scoring-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.scoring_service.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ── Correlation Service ───────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "correlation_service" {
  family                   = "${var.project_name}-correlation-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "correlation-service"
      image     = "${aws_ecr_repository.services["correlation-service"].repository_url}:latest"
      essential = true
      environment = [
        { name = "KAFKA_BOOTSTRAP_SERVERS", value = aws_msk_cluster.main.bootstrap_brokers },
        { name = "PRICE_FETCH_DAYS",        value = tostring(var.price_fetch_days) },
        { name = "NOTIFICATION_PROVIDER",   value = var.notification_provider },
        { name = "APP_URL",                 value = "http://${aws_lb.frontend.dns_name}" },
        { name = "NOTIFY_FROM_EMAIL",       value = var.notify_from_email },
      ]
      secrets = [
        { name = "MONGO_URI",      valueFrom = aws_secretsmanager_secret.mongo_uri.arn },
        { name = "RESEND_API_KEY", valueFrom = aws_secretsmanager_secret.resend_api_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["correlation-service"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "correlation_service" {
  name            = "${var.project_name}-correlation-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.correlation_service.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ── BFF ───────────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "bff" {
  family                   = "${var.project_name}-bff"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "bff"
      image     = "${aws_ecr_repository.services["bff"].repository_url}:latest"
      essential = true
      portMappings = [
        { containerPort = 3001, protocol = "tcp" }
      ]
      environment = [
        { name = "PORT", value = "3001" },
      ]
      secrets = [
        { name = "MONGO_URI",  valueFrom = aws_secretsmanager_secret.mongo_uri.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["bff"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "bff" {
  name            = "${var.project_name}-bff"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.bff.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.bff.arn
    container_name   = "bff"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.bff]

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ── Frontend ──────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project_name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "${aws_ecr_repository.services["frontend"].repository_url}:latest"
      essential = true
      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]
      environment = [
        { name = "PORT", value = "3000" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["frontend"].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "frontend" {
  name            = "${var.project_name}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.frontend]

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}
