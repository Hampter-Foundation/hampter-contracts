# Makefile for Hardhat deployment

# Variables
NETWORK = buildbear
# SCRIPT_PATH = scripts/deploy.ts
DEPLOY_SCRIPT_PATH = deploy/deploy-hamptoken.ts
# DEPLOY_SCRIPT_PATH = deploy/deploy-hampter-auction.ts

# Phony targets
.PHONY: deploy clean help

# Default target
all: deploy

# Deploy the contract
deploy:
	@echo "Deploying HampterAuction contract..."
	npx hardhat run $(DEPLOY_SCRIPT_PATH) --network $(NETWORK)

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	npx hardhat clean
	rm -rf cache artifacts

# Help command
help:
	@echo "Available commands:"
	@echo "  make deploy    - Deploy the HampterAuction contract"
	@echo "  make clean     - Clean build artifacts"
	@echo "  make help      - Show this help message"