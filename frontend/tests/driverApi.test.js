import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDriverApi, driverShipment } from '../src/portals/driver/services/driverApi.js'

test('driver proposes a route but never grants itself approval', async t => {
  t.mock.method(globalThis, 'fetch', async (url, config) => {
    assert.equal(url, '/api/route-requests')
    assert.equal(config.headers.Authorization, 'Bearer driver-token')
    const body = JSON.parse(config.body)
    assert.equal(body.shipment_id, 'SHP-1')
    assert.equal(body.status, undefined)
    assert.deepEqual(body.options[0].points, [[13,74],[13.2,74.2]])
    return Response.json({ status:'pending' })
  })
  const result = await createDriverApi('driver-token').requestReroute({name:'Road alternative',duration:5000,distance:50000,points:[[13,74],[13.2,74.2]],source:'OSRM',conflicts:[]},{id:'SHP-1'},{duration:3600})
  assert.equal(result.status,'pending')
  assert.equal(result.approved,undefined)
})

test('driver incidents use assigned consignment and validated coordinates', async t => {
  t.mock.method(globalThis,'fetch',async (_url,config)=> {
    const body=JSON.parse(config.body)
    assert.equal(body.category,'flood')
    assert.equal(body.severity,'high')
    assert.equal(body.shipment_id,'SHP-1')
    assert.equal(body.lat,13)
    return Response.json({id:'INC-1',created_at:'2026-11-27T00:00:00Z'})
  })
  const service=createDriverApi('driver-token')
  assert.equal((await service.reportIncident({type:'Flooding',severity:'critical',description:'Road flooded',location:'13,74'},{id:'SHP-1'})).id,'INC-1')
  await assert.rejects(service.reportIncident({location:'somewhere'},{id:'SHP-1'}),/latitude, longitude/)
})

test('unknown destinations do not borrow Udupi navigation coordinates',()=> {
  const row=driverShipment({id:'S',truck_id:'T',quantity:3,destination:'Other city',status:'at_port'},{port:{name:'NMP',lat:12,lng:74},vehicles:[{id:'T',name:'Truck',lat:13,lng:75}]},{name:'Driver'})
  assert.equal(row.dropoff,null)
  assert.deepEqual(row.location,[13,75])
})

test('approved reroute clears the stopped UI state despite the retained incident report',()=> {
  const row=driverShipment(
    {id:'S',truck_id:'T',quantity:3,destination:'Udupi',status:'in_transit',hazard_stopped:false},
    {port:{name:'NMP',lat:12,lng:74},vehicles:[{id:'T',name:'Truck',lat:13,lng:75}],incidents:[{shipment_id:'S',status:'reported',description:'Flood'}]},
    {name:'Driver'}
  )
  assert.equal(row.hazard_stopped,false)
  assert.equal(row.status,'in transit')
})
