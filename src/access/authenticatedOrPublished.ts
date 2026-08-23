import type { Access } from 'payload'

/**
 * Collection `read` access for draft-enabled content (Posts, Pages):
 * admin users see everything; anonymous readers get only published docs,
 * expressed as a `_status` query constraint so drafts never leave the API.
 *
 * @remarks This is the draft/published gate only. The gated-body
 * restriction on Posts is layered on top via field-level access on
 * `Posts.content` plus the server-side `canAccess` check.
 */
export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
