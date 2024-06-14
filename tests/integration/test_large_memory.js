import { Logger }			from '@whi/weblogger';
const log				= new Logger("test-basic", process.env.LOG_LEVEL );


import fs				from 'fs';
import path				from 'path';
import crypto				from 'crypto';
import { expect }			from 'chai';
import {
    gzipSync,
    zlibSync,
    unzlibSync,
}					from 'fflate';

import { Holochain }			from '@spartan-hc/holochain-backdrop';
import {
    MereMemoryZomelet,
}					from '@spartan-hc/mere-memory-zomelets';
import {
    AppInterfaceClient,
}					from '@spartan-hc/app-interface-client';
import json				from '@whi/json';

import { expect_reject,
	 linearSuite }			from '../utils.js';

const delay				= (n) => new Promise(f => setTimeout(f, n));
const MEMORY_PATH			= new URL( "../../packs/dna/storage.dna", import.meta.url ).pathname;
const DNA_NAME				= "memory";

let client, installations;

describe("Large Memory", () => {
    const holochain			= new Holochain({
	"timeout": 60_000,
	"default_stdout_loggers": log._level > 3,
    });

    before(async function () {
	this.timeout( 30_000 );

	installations			= await holochain.install([
	    "alice",
	], {
	    "app_name": "test",
	    "bundle": {
		[DNA_NAME]:	MEMORY_PATH,
	    },
	});

	const app_port			= await holochain.ensureAppPort();

	client				= new AppInterfaceClient( app_port, {
	    "logging": process.env.LOG_LEVEL || "fatal",
	});
    });

    linearSuite("Basic", basic_tests.bind( this, holochain ) );

    after(async () => {
	await holochain.destroy();
    });

});


function basic_tests () {
    const bytes				= fs.readFileSync( MEMORY_PATH );
    const repetitions			= Math.floor( 64e6 / bytes.length );
    const too_big_bytes			= new Uint8Array( bytes.length * repetitions );

    // Create an byte array 100 * the normal bytes (approx. 200mb)
    for (let i = 0; i < repetitions; i++) {
	too_big_bytes.set( bytes, i * bytes.length );
    }

    let app_client;
    let mere_memory_api;
    let memory;
    let memory_addr;

    before(async function () {
	this.timeout( 30_000 );

	const auth			= installations.alice.test.auth;
	app_client			= await client.app( auth.token, "test-alice" );

	({
	    memory,
	}				= app_client.createInterface({
	    [DNA_NAME]: {
		"mere_memory_api":	MereMemoryZomelet,
	    },
	}));

	mere_memory_api			= memory.zomes.mere_memory_api.functions;

	const hash_path			= await mere_memory_api.make_hash_path( "trigger init" );

	log.normal("Hash path: %s", json.debug(hash_path) );
    });

    it("should create a large memory", async function () {
	this.timeout( 120_000 );

	memory_addr			= await mere_memory_api.save( too_big_bytes );

	log.normal("New memory address: %s", memory_addr );

	memory				= await mere_memory_api.get_memory_entry( memory_addr );

	log.normal("New memory entry: %s", json.debug(memory) );
    });

    it("should get large memory", async function () {
	this.timeout( 120_000 );

	const [
	    memory_entry,
	    compressed_bytes,
	]				= await mere_memory_api.get_memory_with_bytes( memory_addr );
	const memory_bytes		= await mere_memory_api.gzip_uncompress( compressed_bytes );
	const sha256			= await mere_memory_api.calculate_hash( memory_bytes );

	expect( compressed_bytes.length	).to.equal( memory.memory_size );
	expect( memory_bytes.length	).to.equal( memory.uncompressed_size );
	expect( memory_bytes.length	).to.equal( memory_entry.uncompressed_size );
	expect( memory_entry.hash	).to.equal( sha256 );
    });

    after(async function () {
	await client.close();
    });
}
