# Changelog

All notable changes to `@ngbracket/a11y-testing` are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## 0.6.0

### Added

- Each violation has a `wcag` list: the WCAG 2.2 A and AA criteria its axe
  rule is tagged with, each with its page in the
  [NgBracket accessibility reference](https://ngbracket.com/reference).
  axe's best-practice rules have none.
- `formatViolations()`, and so the failure message of `toHaveNoAxeViolations()`
  and `expectNoAxeViolations()`, adds a line per criterion after axe's rule
  link, such as
  `WCAG 1.1.1 Non-text Content: https://ngbracket.com/reference/wcag/non-text-content`.
  axe's own link is unchanged.
