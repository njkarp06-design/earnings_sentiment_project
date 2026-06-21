# ── Frontend ALB (internet → ECS port 3000) ───────────────────────────────────

resource "aws_lb" "frontend" {
  name               = "${var.project_name}-frontend"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.frontend_alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = { Name = "${var.project_name}-frontend-alb" }
}

resource "aws_lb_target_group" "frontend" {
  name        = "${var.project_name}-frontend-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = { Name = "${var.project_name}-frontend-tg" }
}

resource "aws_lb_listener" "frontend" {
  load_balancer_arn = aws_lb.frontend.arn
  port              = 80
  protocol          = "HTTP"

  # Forward when there's no cert; redirect to HTTPS once one is supplied.
  default_action {
    type             = local.tls_enabled ? "redirect" : "forward"
    target_group_arn = local.tls_enabled ? null : aws_lb_target_group.frontend.arn

    dynamic "redirect" {
      for_each = local.tls_enabled ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "frontend_https" {
  count             = local.tls_enabled ? 1 : 0
  load_balancer_arn = aws_lb.frontend.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# ── BFF ALB (internet → ECS port 3001) ───────────────────────────────────────

resource "aws_lb" "bff" {
  name               = "${var.project_name}-bff"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.bff_alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = { Name = "${var.project_name}-bff-alb" }
}

resource "aws_lb_target_group" "bff" {
  name        = "${var.project_name}-bff-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = { Name = "${var.project_name}-bff-tg" }
}

resource "aws_lb_listener" "bff" {
  load_balancer_arn = aws_lb.bff.arn
  port              = 80
  protocol          = "HTTP"

  # Forward when there's no cert; redirect to HTTPS once one is supplied.
  default_action {
    type             = local.tls_enabled ? "redirect" : "forward"
    target_group_arn = local.tls_enabled ? null : aws_lb_target_group.bff.arn

    dynamic "redirect" {
      for_each = local.tls_enabled ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "bff_https" {
  count             = local.tls_enabled ? 1 : 0
  load_balancer_arn = aws_lb.bff.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.bff.arn
  }
}
