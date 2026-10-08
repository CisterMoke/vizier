import { buildExcelOptionsPayload, DEFAULT_EXCEL_OPTIONS } from './excel'

describe('buildExcelOptionsPayload', () => {
  it('returns undefined for defaults', () => {
    expect(buildExcelOptionsPayload(DEFAULT_EXCEL_OPTIONS)).toBeUndefined()
  })

  it('includes the sheet name when set', () => {
    expect(buildExcelOptionsPayload({ ...DEFAULT_EXCEL_OPTIONS, sheetName: 'Sales' })).toEqual({
      sheet_name: 'Sales',
    })
  })

  it('includes header and skip rows when changed from defaults', () => {
    expect(buildExcelOptionsPayload({ ...DEFAULT_EXCEL_OPTIONS, header: false, skipRows: 2 })).toEqual({
      header: false,
      skip_rows: 2,
    })
  })

  it('ignores blank sheet names', () => {
    expect(buildExcelOptionsPayload({ ...DEFAULT_EXCEL_OPTIONS, sheetName: '   ' })).toBeUndefined()
  })
})
