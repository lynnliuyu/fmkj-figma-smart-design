# Initial import setup notes

Bootstrap verification succeeds.

Deploy verification is blocked by a pre-existing application type error:

```text
components/projects/project-presentation.tsx:250
Property 'totalPages' does not exist on type 'void'.
```

`assertFirstProposalPrintLayout` is declared to return `void`, but the component
destructures `totalPages` from its result. The application source was not changed
because this import pass is setup-only. After correcting that return contract or
call site, rerun:

```sh
figma make verify-deploy
```

Deploy-preview was explicitly verified as skipped because this is a custom
runtime Next.js application rather than the supported generated Payload/Next.js
template, and it cannot be safely represented as a static site.
