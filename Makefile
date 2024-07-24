
MERE_MEMORY_WASM	= target/wasm32-unknown-unknown/release/mere_memory_api.wasm
CORE_WASM		= target/wasm32-unknown-unknown/release/mere_memory.wasm
STORAGE_DNA		= packs/dna/storage.dna
STORAGE_APP		= packs/app/Storage.happ

#
# Project
#
rust_comile_fix:
	touch mere_memory_types/src/lib.rs # force rebuild otherwise rust fails

$(MERE_MEMORY_WASM):	Cargo.toml src/*.rs mere_memory_types/Cargo.toml mere_memory_types/src/*.rs flake.lock
	@echo "Building zome: $@"; \
	RUST_BACKTRACE=1 CARGO_TARGET_DIR=target cargo build \
		--release --target wasm32-unknown-unknown
	@touch $@ # Cargo must have a cache somewhere because it doesn't update the file time

$(CORE_WASM):		mere_memory/Cargo.toml mere_memory/src/*.rs flake.lock  mere_memory_types/Cargo.toml mere_memory_types/src/*.rs
	make rust_comile_fix;
	@echo "Building zome: $@"; \
	cd mere_memory; RUST_BACKTRACE=1 CARGO_TARGET_DIR=../target cargo build \
		--release --target wasm32-unknown-unknown

build:				$(CORE_WASM) $(MERE_MEMORY_WASM)
$(STORAGE_DNA):			$(CORE_WASM) $(MERE_MEMORY_WASM) packs/dna/dna.yaml Cargo.toml mere_memory_types/Cargo.toml mere_memory_types/src/*.rs
	hc dna pack packs/dna/
$(STORAGE_APP):			$(STORAGE_DNA) packs/app/happ.yaml
	hc app pack packs/app/

npm-reinstall-local:
	cd tests; npm uninstall $(NPM_PACKAGE); npm i --save $(LOCAL_PATH)
npm-reinstall-public:
	cd tests; npm uninstall $(NPM_PACKAGE); npm i --save $(NPM_PACKAGE)

npm-use-app-interface-client-public:
npm-use-app-interface-client-local:
npm-use-app-interface-client-%:
	NPM_PACKAGE=@spartan-hc/app-interface-client LOCAL_PATH=../../app-interface-client-js make npm-reinstall-$*

npm-use-backdrop-public:
npm-use-backdrop-local:
npm-use-backdrop-%:
	NPM_PACKAGE=@spartan-hc/holochain-backdrop LOCAL_PATH=../../node-backdrop make npm-reinstall-$*

npm-use-holo-hash-public:
npm-use-holo-hash-local:
npm-use-holo-hash-%:
	NPM_PACKAGE=@spartan-hc/holo-hash LOCAL_PATH=../../holo-hash-js make npm-reinstall-$*


#
# Packages
#
preview-crate:
	DEBUG_LEVEL=trace make -s test
	cd mere_memory_types; cargo publish --dry-run --allow-dirty
publish-crate:			.cargo/credentials
	DEBUG_LEVEL=trace make -s test
	cd mere_memory_types; cargo publish
.cargo/credentials:
	cp ~/$@ $@



#
# Testing
#
DEBUG_LEVEL	       ?= warn
TEST_ENV_VARS		= LOG_LEVEL=$(DEBUG_LEVEL)
MOCHA_OPTS		= -n enable-source-maps -t 5000

%/package-lock.json:	%/package.json
	touch $@
%/node_modules:		%/package-lock.json
	cd $*; npm install
	touch $@

test:
	make -s test-integration

test-integration:
	make -s test-integration-basic
	make -s test-integration-large-memory

test-integration-basic:		$(STORAGE_APP) tests/node_modules zomelets/node_modules
	cd tests; $(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) integration/test_basic.js

test-integration-large-memory:	$(STORAGE_APP) tests/node_modules zomelets/node_modules
	cd tests; $(TEST_ENV_VARS) npx mocha $(MOCHA_OPTS) integration/test_large_memory.js



#
# Documentation
#
test-docs:
	cd mere_memory_types; cargo test --doc
build-docs:			test-docs
	cd mere_memory_types; cargo doc

PRE_HDI_VERSION = hdi = "=0.5.0-dev.8"
NEW_HDI_VERSION = hdi = "=0.5.0-dev.9"

PRE_HDK_VERSION = hdk = "=0.4.0-dev.9"
NEW_HDK_VERSION = hdk = "=0.4.0-dev.10"

PRE_HH_VERSION = version = "=0.4.0-dev.7"
NEW_HH_VERSION = version = "=0.4.0-dev.8"

GG_REPLACE_LOCATIONS = ':(exclude)*.lock' Cargo.toml mere_memory_types/ mere_memory/

update-hdi-version:
	git grep -l '$(PRE_HDI_VERSION)' -- $(GG_REPLACE_LOCATIONS) | xargs sed -i 's|$(PRE_HDI_VERSION)|$(NEW_HDI_VERSION)|g'
update-hdk-version:
	git grep -l '$(PRE_HDK_VERSION)' -- $(GG_REPLACE_LOCATIONS) | xargs sed -i 's|$(PRE_HDK_VERSION)|$(NEW_HDK_VERSION)|g'
update-holo-hash-version:
	git grep -l '$(PRE_HH_VERSION)' -- $(GG_REPLACE_LOCATIONS) | xargs sed -i 's|$(PRE_HH_VERSION)|$(NEW_HH_VERSION)|g'



#
# Repository
#
clean-remove-chaff:
	@find . -name '*~' -exec rm {} \;
clean-files:		clean-remove-chaff
	git clean -nd
clean-files-force:	clean-remove-chaff
	git clean -fd
clean-files-all:	clean-remove-chaff
	git clean -ndx
clean-files-all-force:	clean-remove-chaff
	git clean -fdx



#
# NPM packaging
#
prepare-zomelets-package:	zomelets/node_modules
	cd zomelets; rm -f dist/*
	cd zomelets; npx webpack
	cd zomelets; MODE=production npx webpack
	cd zomelets; gzip -kf dist/*.js
preview-zomelets-package:	clean-files prepare-zomelets-package
	DEBUG_LEVEL=trace make -s test
	cd zomelets; npm pack --dry-run .
create-zomelets-package:	clean-files prepare-zomelets-package
	DEBUG_LEVEL=trace make -s test
	cd zomelets; npm pack .
publish-zomelets-package:	clean-files prepare-zomelets-package
	DEBUG_LEVEL=trace make -s test
	cd zomelets; npm publish --access public .
