import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import { resolveImageContentType, sniffImageType } from '#services/media_store'

/**
 * A photo's format has to be read from the file, not from what the phone said.
 *
 * This was a real bug, found by uploading a PNG to the shop: the multipart
 * parser reports the group only ("image") and keeps the subtype in a different
 * field, so every photo was stored as "….jpg" and served with a header of
 * "image". With "X-Content-Type-Options: nosniff" set site-wide the browser will
 * not second-guess that header, so an uploaded photo never drew. The till's own
 * upload route refused PNGs outright for the same reason.
 *
 * These tests hold both halves in place: the sniffing, and the refusal of
 * anything that is not one of the four formats the shop displays.
 */
test.group('Photo formats', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ])
  const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(16)])
  const webp = Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.alloc(4),
    Buffer.from('WEBP', 'latin1'),
    Buffer.alloc(8),
  ])

  test('reads the four formats the shop shows from their first bytes', ({ assert }) => {
    assert.equal(sniffImageType(jpeg), 'image/jpeg')
    assert.equal(sniffImageType(png), 'image/png')
    assert.equal(sniffImageType(gif), 'image/gif')
    assert.equal(sniffImageType(webp), 'image/webp')
  })

  test('corrects the bare "image" the multipart parser reports', ({ assert }) => {
    /** What the parser hands over for a PNG: the group, with no subtype. */
    assert.equal(resolveImageContentType(png, 'image'), 'image/png')
    assert.equal(resolveImageContentType(jpeg, 'image'), 'image/jpeg')
  })

  test('serves a photo stored before the format was read correctly', ({ assert }) => {
    /** Older records hold "image"; the bytes still know what they are. */
    assert.equal(resolveImageContentType(png, 'image'), 'image/png')
  })

  test('refuses anything that is not a photo', ({ assert }) => {
    const words = Buffer.from('this is not a picture, it is just some words')
    assert.isNull(sniffImageType(words))
    assert.isNull(resolveImageContentType(words, 'image'))
    assert.isNull(resolveImageContentType(words, 'text/plain'))
    /** An empty or cut-off upload is refused even when the name looks correct. */
    assert.isNull(resolveImageContentType(Buffer.alloc(0), 'image/png'))
    assert.isNull(resolveImageContentType(Buffer.alloc(4), 'image/jpeg'))
  })

  test('prefers the bytes when a device claims the wrong format', ({ assert }) => {
    assert.equal(resolveImageContentType(png, 'image/jpeg'), 'image/png')
  })

  test('the till route and the shop screen both use it', ({ assert }) => {
    const pos = readFileSync(app.makePath('app/controllers/pos_api_controller.ts'), 'utf8')
    const admin = readFileSync(app.makePath('app/controllers/admin_controller.ts'), 'utf8')

    assert.include(pos, 'resolveImageContentType')
    assert.include(admin, 'resolveImageContentType')
    assert.notInclude(
      pos,
      "contentType.startsWith('image/')",
      'the group-only check rejected valid PNGs from the till'
    )
    assert.notInclude(
      pos,
      "response.header('content-type', image.contentType)",
      'the recorded type can be wrong; the bytes are served instead'
    )
  })

  test('the shop screen accepts a photo straight off a phone', ({ assert }) => {
    const view = readFileSync(app.makePath('resources/views/pages/admin/products.edge'), 'utf8')
    const controller = readFileSync(app.makePath('app/controllers/admin_controller.ts'), 'utf8')

    assert.include(view, 'enctype="multipart/form-data"', 'a file cannot be sent without it')
    assert.include(view, 'accept="image/*"', 'the phone must offer camera and gallery')
    assert.include(controller, "request.files('photos'", 'the uploads must be read off the form')
  })

  /**
   * One photo of a jacket shows the least convincing part of it. A customer
   * buying second-hand wants the front, the back, the label and the wear, so the
   * intake form has to take several photos and the listing has to carry them all
   * — dropping back to a single photo would quietly undo the point.
   */
  test('a piece can be listed with several angles', ({ assert }) => {
    const view = readFileSync(app.makePath('resources/views/pages/admin/products.edge'), 'utf8')
    const controller = readFileSync(app.makePath('app/controllers/admin_controller.ts'), 'utf8')
    const detail = readFileSync(
      app.makePath('resources/views/components/product_detail.edge'),
      'utf8'
    )

    assert.include(view, 'name="photos"', 'the form must post the photos field')
    assert.include(view, 'multiple', 'one file at a time is the thing being fixed')
    assert.include(controller, 'photos.urls[0]', 'the first photo leads the listing')
    assert.include(controller, 'payload.gallery = photos.urls', 'every photo is the gallery')
    assert.include(detail, 'data-carousel', 'the customer pages through them on the product page')
  })
})
