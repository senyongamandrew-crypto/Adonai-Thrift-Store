import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'

/**
 * The cookie banner is toggled with the HTML "hidden" attribute, but its class
 * sets "display: flex". Both selectors have the same specificity (0,1,0) and
 * the components layer is emitted after Tailwind's base layer, so the flex rule
 * wins and the banner stays on screen — the Accept button appeared to do
 * nothing.
 *
 * The rule below in resources/css/app.css is what makes "hidden" win again
 * (0,2,0 beats 0,1,0). These tests fail loudly if either half of that pair is
 * changed without the other.
 */
test.group('Cookie banner', () => {
  const stylesheet = () => readFileSync(app.makePath('resources/css/app.css'), 'utf8')
  const bannerComponent = () =>
    readFileSync(app.makePath('resources/views/components/cookie_banner.edge'), 'utf8')

  test('keeps the hidden attribute authoritative over the flex layout', ({ assert }) => {
    const css = stylesheet()

    assert.include(css, '.adonai-cookie-banner[hidden]')
    assert.match(
      css,
      /\.adonai-cookie-banner\[hidden\]\s*\{[^}]*display:\s*none/,
      'the guard must set display:none, otherwise the banner cannot be dismissed'
    )
  })

  test('still relies on the hidden attribute in the markup', ({ assert }) => {
    const component = bannerComponent()

    assert.include(
      component,
      'hidden',
      'if the banner stops using the attribute, the CSS guard above becomes dead code'
    )
    assert.include(component, 'data-cookie-accept', 'the Accept button is what the script binds to')
  })
})
