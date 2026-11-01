# ── The switch ────────────────────────────────────────────────────────────────

variable "network" {
  description = "Which Stellar network the service takes payments on: testnet or mainnet."
  type        = string
  default     = "testnet"
  validation {
    condition     = contains(["testnet", "mainnet"], var.network)
    error_message = "network must be \"testnet\" or \"mainnet\"."
  }
}

# ── Oracle Cloud (Always Free) ────────────────────────────────────────────────

variable "oci_region" {
  description = "Your OCI home region, e.g. eu-frankfurt-1. Always Free A1 capacity only exists in the home region."
  type        = string
}

variable "oci_config_profile" {
  description = "Profile in ~/.oci/config to authenticate with."
  type        = string
  default     = "DEFAULT"
}

variable "tenancy_ocid" {
  description = "Tenancy OCID (ocid1.tenancy...). Used to list availability domains."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment for the resources. Empty = the tenancy root compartment."
  type        = string
  default     = ""
}

variable "availability_domain_index" {
  description = "Which availability domain (0, 1, 2). Change it if you get 'Out of host capacity'."
  type        = number
  default     = 0
}

variable "instance_ocpus" {
  description = "Ampere A1 OCPUs. Keep within the Always Free allowance (check your tenancy's limits)."
  type        = number
  default     = 2
}

variable "instance_memory_gbs" {
  description = "Ampere A1 memory in GB. Keep within the Always Free allowance."
  type        = number
  default     = 12
}

variable "boot_volume_gbs" {
  description = "Boot volume size. Always Free includes 200 GB of block storage in total."
  type        = number
  default     = 50
}

variable "ssh_public_key_path" {
  description = "Public key installed for the ubuntu user."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_private_key_path" {
  description = "Matching private key, used by Terraform to deploy over SSH. It never leaves your machine."
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "admin_cidr" {
  description = "Only this CIDR may SSH in, e.g. \"203.0.113.7/32\" (curl -4 ifconfig.me). HTTP is never opened: traffic arrives through Cloudflare Tunnel."
  type        = string
}

# ── Cloudflare ────────────────────────────────────────────────────────────────

variable "cloudflare_api_token" {
  description = "API token with Account › Cloudflare Tunnel: Edit and Zone › DNS: Edit."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  description = "Zone of the domain the service lives under."
  type        = string
}

variable "hostname" {
  description = "Public hostname, e.g. logo.example.com. It becomes PUBLIC_ORIGIN = https://<hostname>."
  type        = string
}

# ── The app ───────────────────────────────────────────────────────────────────

variable "app_repo_url" {
  description = "Git URL of this repository (your fork). Public, or https://<token>@github.com/... for a private one."
  type        = string
  sensitive   = true
}

variable "app_git_ref" {
  description = "Branch, tag or commit to deploy."
  type        = string
  default     = "main"
}

variable "price_usdc" {
  type    = string
  default = "0.10"
}

variable "pay_to_testnet" {
  description = "Public G... address that receives testnet USDC."
  type        = string
  default     = ""
}

variable "pay_to_mainnet" {
  description = "Public G... address that receives mainnet USDC."
  type        = string
  default     = ""
}

variable "agent_id_testnet" {
  description = "Stellar 8004 agent id on testnet (after provider-kit register). Empty until registered."
  type        = string
  default     = ""
}

variable "agent_id_mainnet" {
  type    = string
  default = ""
}

variable "facilitator_api_key_mainnet" {
  description = "OpenZeppelin facilitator key for mainnet (https://channels.openzeppelin.com/gen)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "llm_providers" {
  type    = string
  default = "groq,gemini,openrouter"
}

variable "groq_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "gemini_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "openrouter_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "github_token" {
  description = "Optional fine-grained GitHub token (public repos, no permissions) for 5,000 API calls/hour."
  type        = string
  default     = ""
  sensitive   = true
}
