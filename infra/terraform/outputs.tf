output "url" {
  value = "https://${var.hostname}"
}

output "manifest_url" {
  description = "Paste into provider-kit check / verifier check / stellar-pay."
  value       = "https://${var.hostname}/.well-known/stellar-agent-services.json"
}

output "network" {
  value = var.network
}

output "public_ip" {
  value = oci_core_instance.app.public_ip
}

output "ssh" {
  value = "ssh ubuntu@${oci_core_instance.app.public_ip}"
}

output "logs" {
  value = "ssh ubuntu@${oci_core_instance.app.public_ip} 'cd /opt/logo-agent && sudo docker compose logs -f --tail 100 app'"
}
