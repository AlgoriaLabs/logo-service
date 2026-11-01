# Deploy step: installs the compose file, .env / app.env and the auto-update timer on the server, then starts the app.
#
# Re-runs when any of them changes, so a setting, key, network or channel change is one `terraform apply`:
#   network = "mainnet"   (in terraform.tfvars)   →   terraform apply
# New code needs no Terraform at all: CI publishes IMAGE:APP_TAG and the server's timer pulls it.

locals {
  # Read by compose for ${...} only; the app never sees the tunnel token.
  compose_env = join("\n", [
    "IMAGE=${var.image}",
    "APP_TAG=${var.app_tag}",
    "TUNNEL_TOKEN=${data.cloudflare_zero_trust_tunnel_cloudflared_token.app.token}",
    "",
  ])

  # The app's settings.
  env_lines = [
    "NETWORK=${var.network}",
    "PUBLIC_ORIGIN=https://${var.hostname}",
    "PRICE_USDC=${var.price_usdc}",
    "PAY_TO_TESTNET=${var.pay_to_testnet}",
    "AGENT_ID_TESTNET=${var.agent_id_testnet}",
    "PAY_TO_MAINNET=${var.pay_to_mainnet}",
    "AGENT_ID_MAINNET=${var.agent_id_mainnet}",
    "FACILITATOR_API_KEY_MAINNET=${var.facilitator_api_key_mainnet}",
    "LLM_PROVIDERS=${var.llm_providers}",
    "GROQ_API_KEY=${var.groq_api_key}",
    "GEMINI_API_KEY=${var.gemini_api_key}",
    "OPENROUTER_API_KEY=${var.openrouter_api_key}",
    "GITHUB_TOKEN=${var.github_token}",
    "HEURISTIC_FALLBACK=true",
  ]
  env_file = "${join("\n", local.env_lines)}\n"

  server_files = {
    "compose.yaml"              = file("${path.module}/../server/compose.yaml")
    "update.sh"                 = file("${path.module}/../server/update.sh")
    "logo-agent-update.service" = file("${path.module}/../server/logo-agent-update.service")
    "logo-agent-update.timer"   = file("${path.module}/../server/logo-agent-update.timer")
  }
}

resource "terraform_data" "deploy" {
  triggers_replace = {
    env   = sha256("${local.compose_env}${local.env_file}")
    files = sha256(jsonencode(local.server_files))
    login = sha256("${var.ghcr_username}:${var.ghcr_token}")
  }

  lifecycle {
    precondition {
      condition     = var.network != "testnet" || can(regex("^G[A-Z2-7]{55}$", var.pay_to_testnet))
      error_message = "network = \"testnet\" needs pay_to_testnet: a public G... address."
    }
    precondition {
      condition     = var.network != "mainnet" || can(regex("^G[A-Z2-7]{55}$", var.pay_to_mainnet))
      error_message = "network = \"mainnet\" needs pay_to_mainnet: a public G... address."
    }
    precondition {
      condition     = var.network != "mainnet" || var.facilitator_api_key_mainnet != ""
      error_message = "network = \"mainnet\" needs facilitator_api_key_mainnet (free: https://channels.openzeppelin.com/gen)."
    }
    precondition {
      condition     = (var.ghcr_token == "") == (var.ghcr_username == "")
      error_message = "Set both ghcr_username and ghcr_token (private image), or neither (public image)."
    }
  }

  connection {
    type        = "ssh"
    host        = oci_core_instance.app.public_ip
    user        = "ubuntu"
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = "10m"
  }

  # Wait for first-boot setup (Docker install) to finish.
  provisioner "remote-exec" {
    inline = ["cloud-init status --wait > /dev/null || true", "docker --version"]
  }

  provisioner "file" {
    content     = local.compose_env
    destination = "/tmp/logo-agent.compose.env"
  }

  provisioner "file" {
    content     = local.env_file
    destination = "/tmp/logo-agent.app.env"
  }

  provisioner "file" {
    content     = local.server_files["compose.yaml"]
    destination = "/tmp/logo-agent.compose.yaml"
  }

  provisioner "file" {
    content     = local.server_files["update.sh"]
    destination = "/tmp/logo-agent.update.sh"
  }

  provisioner "file" {
    content     = local.server_files["logo-agent-update.service"]
    destination = "/tmp/logo-agent-update.service"
  }

  provisioner "file" {
    content     = local.server_files["logo-agent-update.timer"]
    destination = "/tmp/logo-agent-update.timer"
  }

  provisioner "remote-exec" {
    inline = [
      "set -e",
      "sudo mkdir -p /opt/logo-agent",
      "sudo install -m 600 /tmp/logo-agent.compose.env /opt/logo-agent/.env",
      "sudo install -m 600 /tmp/logo-agent.app.env /opt/logo-agent/app.env",
      "sudo install -m 644 /tmp/logo-agent.compose.yaml /opt/logo-agent/compose.yaml",
      "sudo install -m 755 /tmp/logo-agent.update.sh /opt/logo-agent/update.sh",
      "sudo install -m 644 /tmp/logo-agent-update.service /tmp/logo-agent-update.timer /etc/systemd/system/",
      "rm -f /tmp/logo-agent.compose.env /tmp/logo-agent.app.env /tmp/logo-agent.compose.yaml /tmp/logo-agent.update.sh /tmp/logo-agent-update.service /tmp/logo-agent-update.timer",
      var.ghcr_token == "" ? "true" : "echo '${var.ghcr_token}' | sudo docker login ghcr.io -u '${var.ghcr_username}' --password-stdin > /dev/null",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable --now logo-agent-update.timer",
      "sudo /opt/logo-agent/update.sh",
      "echo \"Running ${var.image}:${var.app_tag} on ${var.network}\"",
    ]
  }

  depends_on = [cloudflare_zero_trust_tunnel_cloudflared_config.app, cloudflare_dns_record.app]
}
