async function main() {
  if (!location.search) {
    location.search = '?data=network'
    return
  }

  const filename = location.search.split('=')[1]
  const url = `data/${filename}.json`

  const response = await fetch(url)

  if (response.status === 404) {
    alert(`404: ${url} not found`)
  } else {
    const json = await response.json()

    const nodes = new vis.DataSet(json.nodes)
    const edges = new vis.DataSet(json.edges)

    new vis.Network(
      document.getElementById('network-graph'),
      { nodes, edges },
      {}
    )
  }
}

main()
