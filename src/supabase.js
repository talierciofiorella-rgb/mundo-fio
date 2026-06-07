import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zreidxfweuwahmyfvhxl.supabase.co'
const supabaseKey = 'sb_publishable_y_oIZyX4jSdUaD6L-YZccA_IdUpfEpP'

export const supabase = createClient(supabaseUrl, supabaseKey)
