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

# Run Echidna locally
echidna:
	@echo "Running Echidna on all contracts..."
	mkdir -p echidna-reports
	@for file in contracts/*.sol; do \
		contract=$$(basename $$file .sol); \
		echo "Testing $$contract..."; \
		echidna-test $$file --contract $$contract --config $(ECHIDNA_CONFIG) > echidna-reports/$$contract.txt; \
	done