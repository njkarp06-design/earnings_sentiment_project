# MSK configuration — applied to all brokers in the cluster
resource "aws_msk_configuration" "main" {
  kafka_versions = ["3.6.0"]
  name           = "${var.project_name}-msk-config"

  server_properties = <<-EOT
    auto.create.topics.enable=false
    default.replication.factor=2
    min.insync.replicas=1
    num.io.threads=8
    num.network.threads=5
    num.partitions=3
    num.replica.fetchers=2
    socket.request.max.bytes=104857600
    unclean.leader.election.enable=true
    log.retention.hours=168
  EOT
}

# kafka.t3.small × 2 brokers (one per AZ) — ~$93/month.
# Destroy the cluster when not in use to avoid idle charges.
resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.project_name}-kafka"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 2

  broker_node_group_info {
    instance_type   = "kafka.t3.small"
    client_subnets  = aws_subnet.private[*].id
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 20
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  # Allow unauthenticated PLAINTEXT connections within the VPC.
  # The MSK security group restricts access to the ECS security group only.
  client_authentication {
    unauthenticated = true
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "PLAINTEXT"
      in_cluster    = true
    }
  }

  logging {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.services["msk"].name
      }
    }
  }

  tags = { Name = "${var.project_name}-kafka" }
}
