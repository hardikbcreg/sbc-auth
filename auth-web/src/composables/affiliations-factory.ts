/* eslint-disable sort-imports */
import { Business } from './../models/business'
import { AffiliationState, AffiliationFilterParams } from './../models/affiliation'
import { computed, reactive, ref, Ref, watch } from '@vue/composition-api'
import { useStore } from 'vuex-composition-helpers'
import { BaseTableHeaderI } from '@/components/datatable/interfaces'
import { getAffiliationTableHeaders } from '@/resources/table-headers'
import LaunchDarklyService from 'sbc-common-components/src/services/launchdarkly.services'
import { AffiliationTypes, BusinessState, CorpTypes, NrDisplayStates, NrState, LDFlags } from '@/util/constants'
import { CorpTypeCd, GetCorpFullDescription, GetCorpNumberedDescription } from '@bcrs-shared-components/corp-type-module'

const affiliations = (reactive({
  filters: {
    isActive: false,
    filterPayload: {}
  } as AffiliationFilterParams,
  loading: false,
  results: [] as Business[],
  totalResults: 0
}) as unknown) as AffiliationState

export const useAffiliations = () => {
  const store = useStore()
  const businesses = computed(() => store.state.business.businesses)
  const headers: Ref<BaseTableHeaderI[]> = ref([])

  /** Returns true if the affiliation is a Name Request. */
  const isNameRequest = (business: Business): boolean => {
    return (!!business.nameRequest)
  }

  /** Returns true if the affiliation is a temporary business. */
  const isTemporaryBusiness = (business: Business): boolean => {
    return (
      (business.corpType?.code || business.corpType) === CorpTypes.INCORPORATION_APPLICATION ||
      (business.corpType?.code || business.corpType) === CorpTypes.REGISTRATION
    )
  }

  /** Returns the temp business description. */
  const tempDescription = (business: Business): string => {
    switch ((business.corpType?.code || business.corpType) as CorpTypes) {
      case CorpTypes.INCORPORATION_APPLICATION:
        return AffiliationTypes.INCORPORATION_APPLICATION
      case CorpTypes.REGISTRATION:
        return AffiliationTypes.REGISTRATION
      default:
        return '' // should never happen
    }
  }

  /** Returns the type of the affiliation. */
  const type = (business: Business): string => {
    if (isTemporaryBusiness(business) && isNameRequest(business)) {
      // This is a temporary business that was created from a name request
      return tempDescription(business)
    }
    if (isNameRequest(business)) {
      return AffiliationTypes.NAME_REQUEST
    }
    if (isTemporaryBusiness(business)) {
      return tempDescription(business)
    }
    const code: unknown = business.corpType?.code
    return GetCorpFullDescription(code as CorpTypeCd)
  }

  /** Returns the status of the affiliation. */
  const status = (business: Business): string => {
    if (isNameRequest(business)) {
      // Format name request state value
      const state = NrState[(business.nameRequest.state || business.nameRequest.stateCd)?.toUpperCase()]
      if (!state) return 'Unknown'
      if (state === NrState.APPROVED && (!business.nameRequest.expirationDate)) return NrDisplayStates.PROCESSING
      else return NrDisplayStates[state] || 'Unknown'
    }
    if (isTemporaryBusiness(business)) {
      return BusinessState.DRAFT
    }
    if (business.status) {
      return business.status.charAt(0)?.toUpperCase() + business.status?.slice(1)?.toLowerCase()
    }
    return BusinessState.ACTIVE
  }

  /** Returns true if the affiliation is a numbered IA. */
  const isNumberedIncorporationApplication = (item: Business): boolean => {
    return (
      (item.corpType?.code) === CorpTypes.INCORPORATION_APPLICATION
    )
  }

  /** Returns the identifier of the affiliation. */
  const number = (business: Business): string => {
    if (isTemporaryBusiness(business) && isNameRequest(business)) {
      return business.nrNumber
    }
    if (isNameRequest(business)) {
      return business.nameRequest.nrNumber
    }
    if (isNumberedIncorporationApplication(business)) {
      return 'Pending'
    }
    return business.businessIdentifier
  }

  /** Returns the name of the affiliation. */
  const name = (item: Business): string => {
    if (isNumberedIncorporationApplication(item)) {
      const legalType: unknown = item.corpSubType?.code
      // provide fallback for old numbered IAs without corpSubType
      return GetCorpNumberedDescription(legalType as CorpTypeCd) || 'Numbered Company'
    }
    return item.name
  }

  /** Returns the type description. */
  const typeDescription = (business: Business): string => {
    // if this is a name request then show legal type
    if (isNameRequest(business)) {
      const legalType: unknown = business.nameRequest.legalType
      return GetCorpFullDescription(legalType as CorpTypeCd)
    }
    // if this is an IA or registration then show legal type
    if (isTemporaryBusiness(business)) {
      const legalType: unknown = (business.corpSubType?.code || business.corpSubType)
      return GetCorpFullDescription(legalType as CorpTypeCd) // may return ''
    }
    // else show nothing
    return ''
  }

  /** Returns true if the affiliation is approved to start an IA or Registration. */
  const canUseNameRequest = (business: Business): boolean => {
    // Split string tokens into an array to avoid false string matching
    const supportedEntityFlags = LaunchDarklyService.getFlag(LDFlags.IaSupportedEntities)?.split(' ') || []
    return (
      isNameRequest(business) && // Is this a Name Request
      business.nameRequest.enableIncorporation && // Is the Nr state approved (conditionally) or registration
      supportedEntityFlags.includes(business.nameRequest.legalType) && // Feature flagged Nr types
      !!business.nameRequest.expirationDate // Ensure NR isn't processing still
    )
  }

  /** Apply data table headers dynamically to account for computed properties. */
  const getHeaders = (columns?: string[]) => {
    headers.value = getAffiliationTableHeaders(columns)
    const newHeaders: BaseTableHeaderI[] = headers.value.map((header: BaseTableHeaderI, index) => {
      const businesses_: Business[] = businesses.value
      if (header.col === 'Type') {
        const filterValue: { text: string, value: any }[] = businesses_.map(business => ({ text: type(business), value: type(business) }))
        return { ...header, customFilter: { ...header.customFilter, items: filterValue } }
      } else if (header.col === 'Status') {
        const filterValue: { text: string, value: any }[] = businesses_.map(business => ({ text: status(business), value: status(business) }))
        return { ...header, customFilter: { ...header.customFilter, items: filterValue } }
      } else if (header.col === 'Name') {
        const filterValue: { text: string, value: any }[] = businesses_.map((business) => {
          const businessName = isNameRequest(business) ? business.nameRequest.names.map(obj => obj.name).join(' ') : name(business)
          return { text: businessName, value: businessName }
        })
        return { ...header, customFilter: { ...header.customFilter, items: filterValue } }
      } else if (header.col === 'Number') {
        const filterValue: { text: string, value: any }[] = businesses_.map(business => ({ text: number(business), value: number(business) }))
        return { ...header, customFilter: { ...header.customFilter, items: filterValue } }
      } else {
        return { ...header }
      }
    })
    headers.value = newHeaders
  }

  watch(businesses, () => {
    affiliations.results = businesses.value
    affiliations.totalResults = businesses.value.length
    getHeaders()
  }, { immediate: true })

  const entityCount = computed(() => {
    return businesses.value.length
  })

  // get affiliated entities for this organization
  const loadAffiliations = (filterField?: string, value?: any) => {
    affiliations.loading = true
    if (filterField) {
      affiliations.filters.filterPayload[filterField] = value
    }
    affiliations.totalResults = businesses.value.length
    affiliations.results = businesses.value
    affiliations.loading = false
  }

  const updateFilter = (filterField?: string, value?: any) => {
    if (filterField) {
      if (value) {
        affiliations.filters.filterPayload[filterField] = value
        affiliations.filters.isActive = true
      } else {
        delete affiliations.filters.filterPayload[filterField]
      }
    }
    if (Object.keys(affiliations.filters.filterPayload).length === 0) {
      affiliations.filters.isActive = false
    } else {
      affiliations.filters.isActive = true
    }
  }

  const clearAllFilters = () => {
    affiliations.filters.filterPayload = {}
    affiliations.filters.isActive = false
  }

  return {
    entityCount,
    loadAffiliations,
    affiliations,
    clearAllFilters,
    getHeaders,
    type,
    status,
    headers,
    updateFilter,
    typeDescription,
    isNameRequest,
    number,
    name,
    canUseNameRequest,
    tempDescription,
    isTemporaryBusiness
  }
}
