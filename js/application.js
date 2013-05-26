App = Ember.Application.create({
  configuration: Ember.Object.create({
    elasticsearch_url: 'http://localhost:9200'
  })
});

App.IndexRoute = Ember.Route.extend({
  setupController: function(controller) {
    var cluster = App.Cluster.create()
    controller.set('cluster', cluster)
  }
});
