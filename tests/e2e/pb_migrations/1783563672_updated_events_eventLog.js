/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1687431684");

  collection.fields.add(new Field({
    "hidden": false,
    "id": "json3907314266",
    "maxSize": 0,
    "name": "eventLog",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1687431684");

  collection.fields.removeById("json3907314266");

  return app.save(collection);
})
