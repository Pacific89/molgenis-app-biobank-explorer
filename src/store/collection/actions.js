import api from '@molgenis/molgenis-api-client'
import { encodeRsqlValue, transformToRSQL } from '@molgenis/rsql'
import { createInQuery, createQuery } from '../../utils'
import { COLLECTION_QUALITY_INFO_API_PATH } from '../actions'
/**/
import { flatten } from 'lodash'
import initialCollectionColumns from '../../config/initialCollectionColumns'

export const COLLECTION_REPORT_ATTRIBUTE_SELECTOR = () => {
  const collectionRsql = initialCollectionColumns.filter(icc => icc.rsql).map(prop => prop.rsql)

  let rsqlStart = '*,'

  if (collectionRsql.length) {
    rsqlStart += collectionRsql.join(',')
  }

  return `${rsqlStart},biobank(id,name,juridical_person,country,url,contact),contact(title_before_name,first_name,last_name,title_after_name,email,phone),sub_collections(name,id,sub_collections(*),parent_collection,order_of_magnitude,materials(label,uri),data_categories)`
}

export const collectionActions = {

  async initializeCollectionRelationData ({ commit }) {
    // biobank_label is a mapping in the collection table to the name column of biobank table
    const url = '/api/data/eu_bbmri_eric_collections?filter=id,biobank(id,name,label),name,label,collaboration_commercial,parent_collection&expand=biobank&size=10000&sort=biobank_label'

    const response = await api.get(url).catch(error => commit('SetError', error))
    commit('SetAllCollectionRelationData', response)
  },
  /*
   * Retrieves all collection identifiers matching the collection filters, and their biobanks
   */
  async GetCollectionInfo ({ state, commit, getters, dispatch }) {
    // check if initial data is present, else fetch that first
    if (state.collectionRelationData.length === 0) {
      await dispatch('initializeCollectionRelationData')
    }

    commit('SetCollectionInfo', undefined)
    let url = '/api/data/eu_bbmri_eric_collections?filter=id&size=10000&sort=biobank_label'
    if (getters.rsql) {
      url = `${url}&q=${encodeRsqlValue(getters.rsql)}`
    }
    api.get(url)
      .then(response => {
        commit('SetCollectionInfo', response)
        commit('CalculateBiobankCount', getters)
      }, error => {
        commit('SetError', error)
      })
  },
  GetCollectionReport ({ commit }, collectionId) {
    commit('SetLoading', true)
    api.get(`${COLLECTION_QUALITY_INFO_API_PATH}/${collectionId}?attrs=${COLLECTION_REPORT_ATTRIBUTE_SELECTOR()}`).then(response => {
      commit('SetCollectionReport', response)
      commit('SetLoading', false)
    }, error => {
      commit('SetError', error)
      commit('SetLoading', false)
    })
  },
  // We need to get id's to use in RSQL later, because we can't do a join on this table
  GetCollectionIdsForQuality ({ state, commit }) {
    const collectionQuality = state.route.query.collection_quality ? state.route.query.collection_quality : null
    const qualityIds = state.filters.selections.collection_quality ?? collectionQuality
    const selection = 'assess_level_col'
    if (qualityIds && qualityIds.length > 0) {
      const query = encodeRsqlValue(transformToRSQL({
        operator: 'AND',
        operands: flatten([
          state.filters.satisfyAll.includes('collection_quality')
            ? createQuery(qualityIds, selection, state.filters.satisfyAll.includes('collection_quality'))
            : createInQuery(selection, qualityIds)
        ])
      }
      ))
      api.get(`${COLLECTION_QUALITY_INFO_API_PATH}?attrs=collection(id)&q` + query).then(response => {
        commit('SetCollectionIdsWithSelectedQuality', response)
      })
    } else {
      commit('SetCollectionIdsWithSelectedQuality', [])
    }
  }
}
