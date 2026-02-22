package com.example.plantbot.bot;

import com.example.plantbot.domain.PlantType;

public class ConversationState {
  public enum Step {
    NONE,
    ADD_NAME,
    ADD_POT,
    ADD_INTERVAL,
    ADD_TYPE,
    SET_CITY
  }

  private Step step = Step.NONE;
  private String name;
  private Double potVolume;
  private Integer baseInterval;
  private PlantType type;

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

  public void reset() {
    step = Step.NONE;
    name = null;
    potVolume = null;
    baseInterval = null;
    type = null;
  }
}
