package com.example.plantbot.bot;

import com.example.plantbot.domain.PlantType;
import com.example.plantbot.domain.PlantPlacement;
import com.example.plantbot.domain.OutdoorSoilType;
import com.example.plantbot.domain.SunExposure;

public class ConversationState {
  public enum Step {
    NONE,
    ADD_NAME,
    ADD_INTERVAL_DECISION,
    ADD_PLACEMENT,
    ADD_POT,
    ADD_OUTDOOR_AREA,
    ADD_OUTDOOR_SOIL,
    ADD_OUTDOOR_SUN,
    ADD_OUTDOOR_MULCH,
    ADD_OUTDOOR_PERENNIAL,
    ADD_OUTDOOR_WINTER_PAUSE,
    ADD_INTERVAL,
    ADD_TYPE_DECISION,
    ADD_TYPE,
    SET_CITY,
    SET_CITY_CHOOSE
  }

  private Step step = Step.NONE;
  private String name;
  private Double potVolume;
  private Integer baseInterval;
  private PlantType type;
  private PlantPlacement placement;
  private Double outdoorAreaM2;
  private OutdoorSoilType outdoorSoilType;
  private SunExposure sunExposure;
  private Boolean mulched;
  private Boolean perennial;
  private Boolean winterDormancyEnabled;
  private PlantType suggestedType;
  private String lookupSource;

  public Step getStep() {
    return step;
  }

  public void setStep(Step step) {
    this.step = step;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Double getPotVolume() {
    return potVolume;
  }

  public void setPotVolume(Double potVolume) {
    this.potVolume = potVolume;
  }

  public Integer getBaseInterval() {
    return baseInterval;
  }

  public void setBaseInterval(Integer baseInterval) {
    this.baseInterval = baseInterval;
  }

  public PlantType getType() {
    return type;
  }

  public void setType(PlantType type) {
    this.type = type;
  }

  public PlantPlacement getPlacement() {
    return placement;
  }

  public void setPlacement(PlantPlacement placement) {
    this.placement = placement;
  }

  public Double getOutdoorAreaM2() {
    return outdoorAreaM2;
  }

  public void setOutdoorAreaM2(Double outdoorAreaM2) {
    this.outdoorAreaM2 = outdoorAreaM2;
  }

  public OutdoorSoilType getOutdoorSoilType() {
    return outdoorSoilType;
  }

  public void setOutdoorSoilType(OutdoorSoilType outdoorSoilType) {
    this.outdoorSoilType = outdoorSoilType;
  }

  public SunExposure getSunExposure() {
    return sunExposure;
  }

  public void setSunExposure(SunExposure sunExposure) {
    this.sunExposure = sunExposure;
  }

  public Boolean getMulched() {
    return mulched;
  }

  public void setMulched(Boolean mulched) {
    this.mulched = mulched;
  }

  public Boolean getPerennial() {
    return perennial;
  }

  public void setPerennial(Boolean perennial) {
    this.perennial = perennial;
  }

  public Boolean getWinterDormancyEnabled() {
    return winterDormancyEnabled;
  }

  public void setWinterDormancyEnabled(Boolean winterDormancyEnabled) {
    this.winterDormancyEnabled = winterDormancyEnabled;
  }

  public PlantType getSuggestedType() {
    return suggestedType;
  }

  public void setSuggestedType(PlantType suggestedType) {
    this.suggestedType = suggestedType;
  }

  public String getLookupSource() {
    return lookupSource;
  }

  public void setLookupSource(String lookupSource) {
    this.lookupSource = lookupSource;
  }

  public void reset() {
    step = Step.NONE;
    name = null;
    potVolume = null;
    baseInterval = null;
    type = null;
    placement = null;
    outdoorAreaM2 = null;
    outdoorSoilType = null;
    sunExposure = null;
    mulched = null;
    perennial = null;
    winterDormancyEnabled = null;
    suggestedType = null;
    lookupSource = null;
  }
}
