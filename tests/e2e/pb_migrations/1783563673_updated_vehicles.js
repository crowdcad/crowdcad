/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const venues = app.findCollectionByNameOrId("pbc_1379753955");
  venues.fields.add(new Field({ "hidden": false, "id": "bool2470185501", "name": "vehiclesEnabled", "presentable": false, "required": false, "system": false, "type": "bool" }));
  venues.fields.add(new Field({ "hidden": false, "id": "json2470185502", "maxSize": 0, "name": "vehicles", "presentable": false, "required": false, "system": false, "type": "json" }));
  app.save(venues);

  const events = app.findCollectionByNameOrId("pbc_1687431684");
  events.fields.add(new Field({ "hidden": false, "id": "bool2470185503", "name": "vehiclesEnabled", "presentable": false, "required": false, "system": false, "type": "bool" }));
  events.fields.add(new Field({ "hidden": false, "id": "json2470185504", "maxSize": 0, "name": "eventVehicles", "presentable": false, "required": false, "system": false, "type": "json" }));
  return app.save(events);
}, (app) => {
  const venues = app.findCollectionByNameOrId("pbc_1379753955");
  venues.fields.removeById("bool2470185501");
  venues.fields.removeById("json2470185502");
  app.save(venues);

  const events = app.findCollectionByNameOrId("pbc_1687431684");
  events.fields.removeById("bool2470185503");
  events.fields.removeById("json2470185504");
  return app.save(events);
})
