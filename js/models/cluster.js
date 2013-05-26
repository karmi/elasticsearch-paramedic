App.Cluster = Ember.Object.extend({
  init: function() {
    this._super()
    this.__load()

    this.addObserver('health.cluster_name', function() {
      $('title').text('Paramedic | ' + this.get('health.cluster_name'))
    })
  },

  isLoaded: false,

  // Load cluster health info
  //
  __load: function() {
    var self = this

    $.getJSON(App.configuration.elasticsearch_url+"/_cluster/health")
      .done(function(data) {
        self.set('health', data)
        self.set('isLoaded', true)
      })
      .fail(function() {
        console.error('Error loading cluster health')
      })
  }
});
