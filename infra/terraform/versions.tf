# Providers. OCI auth comes from ~/.oci/config (the profile oci CLI setup writes); Cloudflare from an
# API token. Nothing here needs a Stellar key.

terraform {
  required_version = ">= 1.6"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 9.11"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "oci" {
  region              = var.oci_region
  config_file_profile = var.oci_config_profile
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
