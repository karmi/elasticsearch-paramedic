module("Cluster");

  test('loads health on initialization', function() {
    this.e = sinon.mock(App.Cluster.prototype)
    this.e.expects('__load')
    App.Cluster.create()
    this.e.verify()
  })

  test('is not loaded by default', function() {
    var c = App.Cluster.create()

    ok( ! c.get('isLoaded'), JSON.stringify(c.health) )
  })

  asyncTest('is loaded', function() {
    var c = App.Cluster.create()

    wait(function() {
      ok( !! c.get('isLoaded'), JSON.stringify(c.health) )
      start()
    }, 10);
  })
