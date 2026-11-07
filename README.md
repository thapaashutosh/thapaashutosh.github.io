# ashutosh thapa, portfolio

Static site. No build step, no framework. Double click index.html, or:

    python3 -m http.server 8000    # then open http://localhost:8000

The plan for what to do next is in SPRINTS.md.

## Layout

    index.html          all content. Opens straight from the file, no server needed
    css/style.css       tokens (light + dark) at the top, then one block per section
    js/main.js          nav, menu, cursor, magnetic buttons, text roll, scroll animation, tabs, command menu
    js/cloud.js         hero 3D point cloud with a hand written perspective projection
    js/diagrams.js      architecture diagrams generated as SVG
    js/iforest.js       Isolation Forest from scratch
    js/tripwire.js      Tripwire demo
    js/hawkplan.js      HawkPlan demo (topological sort + list scheduling)
    js/relay.js         Relay demo (semantic cache + token bucket / circuit breaker)
    assets/             resume pdf

GSAP, ScrollTrigger and Lenis load from a CDN. If they fail, the page still works, just without the scroll animation.

## Deploy (GitHub Pages)

1. Create a repo named `thapaashutosh.github.io`.
2. Push this folder to `main`.
3. Settings > Pages > deploy from branch `main`, root.

Vercel or Netlify also work: import the repo, no build command, output dir `.`.
