output "frontend_url" {
  description = "Public URL of the Next.js frontend (via ALB)"
  value       = "http://${aws_lb.frontend.dns_name}"
}

output "bff_url" {
  description = "Public URL of the BFF REST API (via ALB) — used as NEXT_PUBLIC_API_URL"
  value       = "http://${aws_lb.bff.dns_name}"
}

output "ecr_registry" {
  description = "ECR registry base URL: <account>.dkr.ecr.<region>.amazonaws.com"
  value       = local.ecr_registry
}

output "kafka_bootstrap_brokers" {
  description = "Kafka bootstrap broker (Cloud Map DNS, resolvable within the VPC)"
  value       = "kafka.esp.local:9092"
}

output "transcript_bucket" {
  description = "S3 bucket name for raw transcript archives"
  value       = aws_s3_bucket.transcripts.bucket
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "private_subnet_ids" {
  description = "Private subnet IDs (used when running one-shot ECS tasks from CI/CD)"
  value       = aws_subnet.private[*].id
}

output "ecs_security_group_id" {
  description = "Security group ID shared by all ECS tasks"
  value       = aws_security_group.ecs.id
}

output "nat_gateway_ip" {
  description = "NAT gateway public IP — add this to MongoDB Atlas → Network Access"
  value       = aws_eip.nat.public_ip
}
