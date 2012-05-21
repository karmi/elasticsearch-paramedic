function l(m) { Ember.Logger.log(m); }

var App = Em.Application.create({
  name: "Paramedic",

  ready: function() {
    l(App.name + ' loaded.')
    App.indices.__perform_refresh();
    return this._super()
  ;}
});

// ===== Models ===================================================================================

App.Node = Ember.Object.extend({
});

App.Index = Ember.Object.extend({
});

App.Index.Shard = Ember.Object.extend({
});

// ===== Controllers ==============================================================================

App.indices = Ember.ArrayController.create({
  content: [],

  contains: function(item) {
    return (Ember.typeOf(item) == 'string') ? this.mapProperty('name').contains(item) : this._super();
  },

  refresh: function() {
    clearTimeout(App.indices.poller)

    App.indices.poller = setTimeout(
      function() { App.indices.__perform_refresh() },
      1000
    )
  },

  __perform_refresh: function() {
    var self = this;

    // Get state information from the Status API
    //
    $.getJSON("http://localhost:9200/_status?recovery=true", function(data) {
      for (var index_name in data.indices) {

        // Create or find an index
        //
        if ( !self.contains(index_name) ) self.addObject(App.Index.create({ name: index_name }))
        var index = self.findProperty("name", index_name)

        // Update index properties
        //
        index
          .set("size",          data.indices[index_name]['index']['primary_size'])
          .set("docs",          data.indices[index_name]['docs']['num_docs'])

          .set("shards", function() {
            var shards = []
            for (var shard_name in data.indices[index_name]['shards']) {

              data.indices[index_name]['shards'][shard_name].forEach(function(shard_data) {
                // l(shard_data)
                var shard = App.Index.Shard.create({
                  name: shard_name,
                  state: shard_data.state,
                  primary: shard_data.routing.primary,
                  node_id: shard_data.routing.node,
                  relocating_node_id: shard_data.routing.relocating_node,
                  size: shard_data.index.size,
                  docs: shard_data.docs.num_docs
                });
                shard
                  .set("recovery", function() {
                    var recovery_type = shard_data['gateway_recovery'] ? 'gateway_recovery' : 'peer_recovery'

                    return {
                      stage:    shard_data[recovery_type].stage,
                      time:     shard_data[recovery_type].time,
                      progress: shard_data[recovery_type].index.progress,
                      size:     shard_data[recovery_type].index.size,
                      reused_size: shard_data[recovery_type].index.reused_size
                    }
                  }())

                shards.addObject(shard);
              });
            }
            return shards.sort(function(a,b) {return a.get('primary') < b.get('primary')})
          }())

        // Remove deleted indices from the collection
        // TODO: Use model instance identity for this
        //
        self.forEach(function(item) {
          // console.log(item.name)
          var loc = self.content.length || 0
          while(--loc >= 0) {
            var curObject = self.content.objectAt(loc)
            if ( !Ember.keys(data.indices).contains(item.name) && curObject.name === item.name) {
              self.content.removeAt(loc)
            }
          }
        })
      }
    });

    App.indices.refresh();
  }
});
