/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1687431684");

  collection.fields.add(new Field({
    "hidden": false,
    "id": "json2740916538",
    "maxSize": 0,
    "name": "mci",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1687431684");

  collection.fields.removeById("json2740916538");

  return app.save(collection);
})
