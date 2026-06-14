# ── AWS Cloud Map — private DNS so ECS services can find Kafka by name ────────

resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "esp.local"
  vpc  = aws_vpc.main.id
  tags = { Name = "${var.project_name}-dns-namespace" }
}

resource "aws_service_discovery_service" "kafka" {
  name = "kafka"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}
