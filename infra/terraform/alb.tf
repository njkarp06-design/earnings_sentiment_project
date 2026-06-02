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

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.bff.arn
  }
}
