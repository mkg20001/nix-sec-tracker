'use strict'

const fetch = require('node-fetch')
const storage = require('node-persist')

const wait = (i) => new Promise((resolve, reject) => setTimeout(resolve, i))

async function api (page, id) {
  const params = {
    state: 'all'
  }

  if (page) {
    params.page = page
  }

  const url = `https://api.github.com/repos/nixos/nixpkgs/pulls${id ? '/id' : '?' + String(new URLSearchParams(params))}`

  console.log('GET %s', url)
  const res = await fetch(url)

  if (res.status === 403) { // we're out of requests, wait
    console.log('Out of requests, waiting 5 mins...')
    await wait(5 * 60 * 1000)
    return api(page)
  }

  return {
    res: await res.json(),
    next: res.headers.get('link') && res.headers.get('link').indexOf('next') !== -1 // TODO: add
  }
}

function isRelevant (pr) {
  return Boolean(pr.labels.filter(label => label.name === '1.severity: security').length)
}

const CVE_REGEX = /CVE-[0-9]{4}-[0-9]+/gmi
const WELL_FORMATTED_UPGRADE = /^(.+): ?([0-9].[0-9.a-z-]+) ?-?>? ?([0-9].[0-9.a-z-]+).*$/i

function uniq () {
  const seen = {}
  return (el) => {
    if (seen[el]) return false
    return (seen[el] = true)
  }
}

async function index (pr) { // TODO: actually do that
  const text = pr.title + '\n' + pr.body

  const out = {
    pr: {
      url: pr.html_url,
      id: pr.id,
      title: pr.title,
      body: pr.body
    },
    CVEs: [],
    pkg: null,
    affectedVersions: [],
    fixedVersion: null
  }

  let matches
  const output = []
  while ((matches = CVE_REGEX.exec(text))) {
    output.push(matches[0])
  }

  out.CVEs = output.map(o => o.toUpperCase().trim()).filter(uniq())

  const match = pr.title.match(WELL_FORMATTED_UPGRADE)
  if (match) {
    out.pkg = match[1]
    out.affectedVersions.push(match[2])
    out.fixedVersion = match[3]
  }

  console.log(out)

  return out
}

async function pull () {
  const lastIdSeen = (await storage.getItem('lastId')) || 0
  const openPRs = (await storage.getItem('openPRs')) || []
  let page = 0
  let firstIdSeen = 0

  while (true) {
    const res = await api(page)

    for (let i = 0; i < res.res.length; i++) {
      const pr = res.res[i]

      if (!firstIdSeen) {
        firstIdSeen = pr.id
      }

      if (pr.id <= lastIdSeen) {
        // we're done
        break
      }

      if (isRelevant(pr)) {
        await index(pr)

        if (pr.state !== 'closed') {
          openPRs.push(pr.id)
        }
      }
    }

    if (res.next) { page++ } else { break }
  }

  if (firstIdSeen !== lastIdSeen) {
    await storage.setItem('lastId', firstIdSeen)
  }

  await storage.setItem('openPRs', openPRs)
}

async function reindexOpenPRs () {
  const newOpenPRs = []

  const openPRs = await storage.getItem('openPRs') || []
  for (let i = 0; i < openPRs.length; i++) {
    const id = openPRs[i]
    const { res: pr } = await api(null, id)

    await index(pr)

    if (pr.state !== 'closed') {
      newOpenPRs.push(pr.id)
    }
  }

  await storage.setItem('newOpenPRs', newOpenPRs)
}

async function main () {
  await await storage.init()
  await reindexOpenPRs()
  await pull()
}

main().then(console.log, console.error)
