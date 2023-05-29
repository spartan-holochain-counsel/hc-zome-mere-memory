const path				= require('path');
const log				= require('@whi/stdlog')(path.basename( __filename ), {
    level: process.env.LOG_LEVEL || 'fatal',
});


const fs				= require('fs');
const crypto				= require('crypto');
const expect				= require('chai').expect;
const { HoloHash }			= require('@whi/holo-hash');
const { Holochain }			= require('@whi/holochain-backdrop');
const { CruxConfig }			= require('@whi/crux-payload-parser');
const json				= require('@whi/json');
const { expect_reject }			= require('../utils.js');


const delay				= (n) => new Promise(f => setTimeout(f, n));
const MEMORY_PATH			= path.join(__dirname, "../../packs/dna/storage.dna");
let client;


function basic_tests () {
    const input				= (new Uint8Array(3_000_000)).fill(1);
    let memory_addr, memory_block_addr;
    let memory;

    it("should create a memory block", async function () {
	this.timeout( 10_000 );

	let input			= {
	    "sequence": {
		"position": 1,
		"length": 1,
	    },
	    "bytes": crypto.randomBytes( 100 ),
	};
	let resp			= await client.call( "memory", "mere_memory_api", "create_memory_block", input )
	let addr			= new HoloHash( resp );
	log.normal("New memory block address: %s", String(addr) );

	memory_block_addr		= addr;
    });

    it("should create a memory", async function () {
	this.timeout( 10_000 );

	let hash			= new Array(32).fill(0);
	let input			= {
	    hash,
	    "block_addresses": [
		memory_block_addr,
	    ],
	    "memory_size": 100,
	};
	let resp			= await client.call( "memory", "mere_memory_api", "create_memory", input )
	let addr			= new HoloHash( resp );
	log.normal("New memory address: %s", String(addr) );
    });

    it("should create a memory using 'save_bytes'", async function () {
	this.timeout( 10_000 );

	let resp			= await client.call( "memory", "mere_memory_api", "save_bytes", input )
	let addr			= new HoloHash( resp );
	log.normal("New memory address: %s", String(addr) );

	memory_addr			= addr;
    });

    it("should get a memory using 'retrieve_bytes'", async function () {
	this.timeout( 10_000 );

	memory				= await client.call( "memory", "mere_memory_api", "get_memory", memory_addr );
	log.normal("New memory: %s", json.debug(memory) );
    });

    it("should calculate hash of the memory bytes", async function () {
	this.timeout( 10_000 );

	{
	    let hash			= await client.call( "memory", "mere_memory_api", "calculate_hash", input );
	    log.normal("Calculated hash: %s", hash );

	    expect( hash		).to.deep.equal( memory.hash );
	}

	{
	    let hash			= await client.call( "memory", "mere_memory_api", "calculate_hash", Buffer.from("hello world") );
	    log.normal("Calculated hash: %s", hash );

	    expect( hash		).to.equal("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
	}
    });

    it("should find a memory based on the hash", async function () {
	this.timeout( 10_000 );

	{
	    let exists			= await client.call( "memory", "mere_memory_api", "memory_exists", input );
	    log.normal("Memory exists: %s", exists );

	    expect( exists		).to.be.true;
	}

	{
	    let exists			= await client.call( "memory", "mere_memory_api", "memory_exists", Buffer.from("hello world") );
	    log.normal("Memory exists: %s", exists );

	    expect( exists		).to.be.false;
	}
    });
}

function errors_tests () {
    it("should fail to create memory block because it is too big", async function () {
	this.timeout( 10_000 );

	await expect_reject( async () => {
	    const chunk			= new Uint8Array( 2_097_153 ).fill(0);
	    const block_addr		= await client.call( "memory", "mere_memory_api", "create_memory_block", {
		"sequence": {
		    "position": 1,
		    "length": 1,
		},
		"bytes": Array.from(chunk),
	    });
	}, "InvalidCommit error: MemoryBlockEntry cannot be larger than 2MB (2,097,152 bytes)" );
    });

    it("should fail to create memory with wrong byte size", async function () {
	this.timeout( 10_000 );

	await expect_reject( async () => {
	    const chunk			= crypto.randomBytes( 64 );
	    const block_addr		= await client.call( "memory", "mere_memory_api", "create_memory_block", {
		"sequence": {
		    "position": 1,
		    "length": 1,
		},
		"bytes": Array.from(chunk),
	    });
	    await client.call( "memory", "mere_memory_api", "create_memory", {
		"hash":		new Array(32).fill(0),
		"block_addresses": [ block_addr ],
		"memory_size":	65,
	    });
	}, "InvalidCommit error: MemoryEntry 'memory_size' does not equal the sum of its blocks" );
    });
}

describe("Zome: Mere Memory", () => {
    const crux				= new CruxConfig();
    const holochain			= new Holochain({
	"default_loggers": !!process.env.LOG_LEVEL,
    });

    before(async function () {
	this.timeout( 30_000 );

	const clients			= await holochain.backdrop({
	    "test": {
		"memory":	MEMORY_PATH,
	    },
	});

	client				= clients.alice.test.client;

	crux.upgrade( client );
    });

    describe("Basic", basic_tests.bind( this, holochain ) );
    describe("Errors", errors_tests.bind( this, holochain ) );

    after(async () => {
	await holochain.stop();
	await holochain.destroy();
    });

});
