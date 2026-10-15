# Public and local smoke contract for the static site.
# Pass the target with: --variable base_url=https://example.test

GET {{base_url}}/
HTTP 200
[Asserts]
header "content-type" contains "text/html"
xpath "string(/html/head/title)" contains "Top Articles"
xpath "string(//h1)" == "Top Articles"
body contains "Mijn persoonlijke Readwise-toplijsten"

GET {{base_url}}/styles.css
HTTP 200
[Asserts]
header "content-type" contains "text/css"
body contains "--"

GET {{base_url}}/data/score.js
HTTP 200
[Asserts]
header "content-type" contains "javascript"
body contains "TOP_ARTICLE_PRIORITY"

GET {{base_url}}/data/data.js
HTTP 200
[Asserts]
header "content-type" contains "javascript"
body contains "TOP_ARTICLES"

GET {{base_url}}/dist/src/app.js
HTTP 200
[Asserts]
header "content-type" contains "javascript"
body contains "TOP_ARTICLES"
