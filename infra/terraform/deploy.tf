# Deploy step: writes /opt/logo-agent/.env, checks out app_git_ref and runs docker compose.
#
# It re-runs whenever the rendered .env or the ref changes, so switching networks is:
#   network = "mainnet"   (in terraform.tfvars)   →   terraform apply
# To ship new commits on the same branch:  terraform apply -replace=terraform_data.deploy

locals {
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
    "COMPOSE_PROFILES=tunnel",
    "TUNNEL_TOKEN=${data.cloudflare_zero_trust_tunnel_cloudflared_token.app.token}",
  ]
  env_file = "${join("\n", local.env_lines)}\n"
}

resource "terraform_data" "deploy" {
  triggers_replace = {
    env = sha256(local.env_file)
    ref = var.app_git_ref
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
  }

  connection {
    type        = "ssh"
    host        = oci_core_instance.app.public_ip
    user        = "ubuntu"
    private_key = file(pathexpand(var.ssh_private_key_path))
    timeout     = "10m"
  }

  # Wait for first-boot setup (Docker install, clone) to finish.
  provisioner "remote-exec" {
    inline = ["cloud-init status --wait > /dev/null || true", "test -d /opt/logo-agent/.git"]
  }

  provisioner "file" {
    content     = local.env_file
    destination = "/tmp/logo-agent.env"
  }

  provisioner "remote-exec" {
    inline = [
      "set -e",
      "sudo install -o root -g root -m 600 /tmp/logo-agent.env /opt/logo-agent/.env && rm -f /tmp/logo-agent.env",
      "cd /opt/logo-agent",
      "sudo git fetch -q --depth 1 origin '${var.app_git_ref}'",
      "sudo git checkout -q FETCH_HEAD",
      "sudo docker compose up -d --build --remove-orphans",
      "sudo docker image prune -f > /dev/null",
      "echo \"Deployed $(git rev-parse --short HEAD) on ${var.network}\"",
    ]
  }

  depends_on = [cloudflare_zero_trust_tunnel_cloudflared_config.app, cloudflare_dns_record.app]
}
