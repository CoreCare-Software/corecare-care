# CoreCare v1.25.4

## Care-plan section toggle stability

- Replaced checkbox-based domain toggles with dedicated switch buttons.
- Removed disabling, hiding and class-based restyling of the care-plan field subtree.
- Domain inclusion is now stored through `aria-checked` and collected on save.
- Avoids the Firefox blank-modal repaint fault.

Database migration: not required.
