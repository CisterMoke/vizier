import Plotly from 'plotly.js/lib/core'
import bar from 'plotly.js/lib/bar'
import pie from 'plotly.js/lib/pie'
import heatmap from 'plotly.js/lib/heatmap'
import scattergeo from 'plotly.js/lib/scattergeo'

Plotly.register([bar, pie, heatmap, scattergeo])

export default Plotly
